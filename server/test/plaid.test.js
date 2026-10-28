import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { inspect } from 'node:util';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { decrypt, encrypt, loadKey } from '../src/crypto.js';
import { mapCategory } from '../src/plaid.js';
import { assertLoopbackBind, isLoopbackAddress, localOnly } from '../src/guard.js';

const KEY = 'a'.repeat(64);

const tx = (id, amount, category, extra = {}) => ({
  transaction_id: id,
  account_id: 'acc1',
  amount,
  date: '2026-10-20',
  name: `tx ${id}`,
  merchant_name: null,
  iso_currency_code: 'USD',
  pending: false,
  personal_finance_category: { primary: category.split(':')[0], detailed: category.split(':')[1] ?? category },
  ...extra,
});

const firstSyncPages = (prefix) => [
  { added: [tx(`${prefix}1`, 12.34, 'FOOD_AND_DRINK:FOOD_AND_DRINK_GROCERIES'), tx(`${prefix}2`, -2400, 'INCOME:INCOME_WAGES')], modified: [], removed: [], next_cursor: 'c1', has_more: true },
  { added: [tx(`${prefix}3`, 50, 'TRANSFER_OUT:TRANSFER_OUT_ACCOUNT_TRANSFER'), tx(`${prefix}4`, 9.99, 'ENTERTAINMENT', { iso_currency_code: 'CAD' })], modified: [], removed: [], next_cursor: 'c2', has_more: false },
];

// A scriptable stand-in for the Plaid client.
function fakePlaid() {
  const f = {
    calls: { syncCursors: [], removed: 0 },
    itemId: 'item1',
    failAccounts: false,
    transportError: null,
    pages: [],
    page: 0,
    setPages(pages) {
      f.pages = pages;
      f.page = 0;
      f.calls.syncCursors = [];
    },
  };
  const guard = () => {
    if (f.transportError) throw f.transportError;
  };
  return Object.assign(f, {
    linkTokenCreate: async () => (guard(), { data: { link_token: 'link-sandbox-123' } }),
    itemPublicTokenExchange: async ({ public_token }) => {
      guard();
      if (public_token === 'bad') throw { response: { data: { error_code: 'INVALID_PUBLIC_TOKEN', error_message: 'bad token' } } };
      return { data: { access_token: 'access-secret-token', item_id: f.itemId } };
    },
    accountsGet: async () => {
      guard();
      if (f.failAccounts) throw { response: { data: { error_code: 'INTERNAL_SERVER_ERROR', error_message: 'try later' } } };
      return {
        data: { accounts: [{ account_id: 'acc1', name: 'Checking', mask: '0000', type: 'depository', subtype: 'checking', balances: { current: 1000.5, available: 900, iso_currency_code: 'USD' } }] },
      };
    },
    transactionsSync: async ({ cursor }) => {
      guard();
      f.calls.syncCursors.push(cursor);
      return { data: f.pages[f.page++] };
    },
    itemRemove: async () => {
      f.calls.removed++;
      return { data: {} };
    },
  });
}

let server;
let base;
let db;
let plaid;

before(async () => {
  db = openDb(':memory:');
  plaid = fakePlaid();
  const app = createApp(db, { plaidClient: plaid, env: { TOKEN_ENCRYPTION_KEY: KEY } });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://localhost:${server.address().port}/api`;
});

after(() => server.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const importedCount = () => db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE plaid_transaction_id IS NOT NULL').get().n;

test('encryption round-trips and rejects bad keys and tampering', () => {
  const key = loadKey(KEY);
  const enc = encrypt('access-token', key);
  assert.notEqual(enc, 'access-token');
  assert.equal(decrypt(enc, key), 'access-token');
  assert.notEqual(encrypt('access-token', key), enc, 'random IV per encryption');
  assert.throws(() => loadKey('short'), /64 hex/);
  const tampered = enc.slice(0, -2) + (enc.endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => decrypt(tampered, key));
});

test('maps Plaid categories into app categories', () => {
  assert.equal(mapCategory(tx('x', 5, 'FOOD_AND_DRINK:FOOD_AND_DRINK_GROCERIES')), 'Groceries');
  assert.equal(mapCategory(tx('x', 5, 'FOOD_AND_DRINK:FOOD_AND_DRINK_RESTAURANT')), 'Dining out');
  assert.equal(mapCategory(tx('x', 5, 'TRANSPORTATION')), 'Transport');
  assert.equal(mapCategory(tx('x', 5, 'RENT_AND_UTILITIES')), 'Rent & bills');
  assert.equal(mapCategory(tx('x', -5, 'INCOME')), 'Income');
  assert.equal(mapCategory(tx('x', 5, 'SOMETHING_NEW')), 'Other');
});

test('status reports configured Plaid; link token is created', async () => {
  assert.deepEqual((await call('GET', '/plaid/status')).body, { configured: true, environment: 'sandbox' });
  assert.equal((await call('POST', '/plaid/link-token')).body.link_token, 'link-sandbox-123');
});

test('exchange stores the access token encrypted and saves accounts', async () => {
  const bad = await call('POST', '/plaid/exchange', { public_token: 'bad' });
  assert.equal(bad.status, 502);
  assert.equal((await call('POST', '/plaid/exchange', {})).status, 400);

  const ok = await call('POST', '/plaid/exchange', { public_token: 'public-ok', institution_name: 'First Platypus Bank' });
  assert.equal(ok.status, 201);

  const row = db.prepare('SELECT * FROM plaid_items').get();
  assert.ok(!row.access_token_enc.includes('access-secret-token'));
  assert.equal(decrypt(row.access_token_enc, loadKey(KEY)), 'access-secret-token');

  const items = (await call('GET', '/plaid/items')).body;
  assert.equal(items.length, 1);
  assert.equal(items[0].institution_name, 'First Platypus Bank');
  assert.equal(items[0].accounts[0].current_cents, 100050);
  assert.equal(JSON.stringify(items).includes('access'), false, 'tokens never leave the server');
});

test('sync imports, skips transfers and foreign currency, then applies changes without duplicates', async () => {
  plaid.setPages([
    ...firstSyncPages('t'),
    { added: [], modified: [tx('t1', 15, 'FOOD_AND_DRINK:FOOD_AND_DRINK_GROCERIES')], removed: [{ transaction_id: 't2' }], next_cursor: 'c3', has_more: false },
  ]);
  const first = (await call('POST', '/plaid/sync')).body;
  assert.deepEqual([first.added, first.skipped, first.errors.length], [2, 2, 0]);
  assert.deepEqual(plaid.calls.syncCursors, [undefined, 'c1'], 'pages through has_more');

  let rows = (await call('GET', '/transactions')).body;
  assert.equal(rows.length, 2);
  const grocery = rows.find((r) => r.plaid_transaction_id === 't1');
  assert.deepEqual([grocery.type, grocery.amount_cents, grocery.category], ['expense', 1234, 'Groceries']);
  assert.equal(rows.find((r) => r.plaid_transaction_id === 't2').type, 'income');

  // user recategorizes; a later Plaid modification must not overwrite it
  db.prepare("UPDATE transactions SET category = 'Dining out' WHERE plaid_transaction_id = 't1'").run();

  const second = (await call('POST', '/plaid/sync')).body;
  assert.deepEqual([second.modified, second.removed], [1, 1]);
  assert.equal(plaid.calls.syncCursors[2], 'c2', 'resumes from the saved cursor');

  rows = (await call('GET', '/transactions')).body;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].amount_cents, rows[0].category], [1500, 'Dining out']);
});

test('removing a bank revokes it at Plaid and deletes its accounts and imported rows, but not manual ones', async () => {
  await call('POST', '/transactions', { type: 'expense', amount_cents: 700, category: 'Leisure', date: '2026-10-21' });
  assert.equal(importedCount(), 1);

  const id = (await call('GET', '/plaid/items')).body[0].id;
  assert.equal((await call('DELETE', `/plaid/items/${id}`)).status, 204);
  assert.equal(plaid.calls.removed, 1);
  assert.equal((await call('GET', '/plaid/items')).body.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plaid_accounts').get().n, 0);
  assert.equal(importedCount(), 0);
  const rows = (await call('GET', '/transactions')).body;
  assert.deepEqual(rows.map((r) => r.amount_cents), [700], 'manual entry is kept');
  assert.equal((await call('DELETE', `/plaid/items/${id}`)).status, 404);
});

test('relinking the same bank under a new Item and new transaction ids does not duplicate history', async () => {
  plaid.itemId = 'item2';
  plaid.setPages(firstSyncPages('u'));
  assert.equal((await call('POST', '/plaid/exchange', { public_token: 'again', institution_name: 'First Platypus Bank' })).status, 201);
  await call('POST', '/plaid/sync');
  assert.equal(importedCount(), 2);

  // remove and relink a second time: still exactly one copy of the history
  const id = (await call('GET', '/plaid/items')).body[0].id;
  await call('DELETE', `/plaid/items/${id}`);
  plaid.itemId = 'item3';
  plaid.setPages(firstSyncPages('w'));
  await call('POST', '/plaid/exchange', { public_token: 'third', institution_name: 'First Platypus Bank' });
  await call('POST', '/plaid/sync');
  assert.equal(importedCount(), 2);
  assert.equal((await call('GET', '/transactions')).body.length, 3, 'two imported plus the manual entry');
});

test('a failed account load during linking leaves nothing stored and revokes the new Item', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM plaid_items').get().n;
  const revoked = plaid.calls.removed;
  plaid.itemId = 'item-half';
  plaid.failAccounts = true;
  const res = await call('POST', '/plaid/exchange', { public_token: 'x', institution_name: 'Half Bank' });
  plaid.failAccounts = false;

  assert.equal(res.status, 502);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plaid_items').get().n, before);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM plaid_items WHERE item_id = 'item-half'").get().n, 0);
  assert.equal(plaid.calls.removed, revoked + 1, 'orphaned Item is revoked at Plaid');
});

test('transport errors never leak Plaid credentials or tokens, in responses or logs', async () => {
  const secretError = Object.assign(new Error('connect ECONNRESET 1.2.3.4:443'), {
    code: 'ECONNRESET',
    config: {
      headers: { 'PLAID-CLIENT-ID': 'SENTINEL-CLIENT', 'PLAID-SECRET': 'SENTINEL-SECRET' },
      data: '{"access_token":"SENTINEL-TOKEN"}',
    },
    request: { _header: 'PLAID-SECRET: SENTINEL-SECRET' },
  });
  plaid.transportError = secretError;

  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(inspect(args, { depth: 6 }));
  try {
    const link = await call('POST', '/plaid/link-token');
    const sync = await call('POST', '/plaid/sync');
    const everything = JSON.stringify([link, sync]) + logged.join('\n');

    assert.equal(link.status, 502);
    assert.equal(link.body.error, 'Could not reach Plaid. Check your connection and try again.');
    assert.equal(sync.body.errors[0].code, 'ECONNRESET');
    assert.equal(/SENTINEL/.test(everything), false, 'no secret appears anywhere');
  } finally {
    console.error = originalError;
    plaid.transportError = null;
  }
});

test('guard: only loopback peers and local hostnames are accepted', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.20'), false);
  assert.equal(isLoopbackAddress('::ffff:192.168.1.20'), false);
  assert.equal(isLoopbackAddress(undefined), false);

  const run = (remoteAddress, host) => {
    let result = 'next';
    localOnly()({ socket: { remoteAddress }, headers: { host } }, null, (error) => {
      if (error) result = error.status;
    });
    return result;
  };
  assert.equal(run('127.0.0.1', 'localhost:3001'), 'next');
  assert.equal(run('192.168.1.20', 'localhost:3001'), 403, 'a LAN client cannot pass by sending Host: localhost');
  assert.equal(run('127.0.0.1', 'evil.example.com'), 403);

  assert.doesNotThrow(() => assertLoopbackBind('127.0.0.1'));
  assert.doesNotThrow(() => assertLoopbackBind('localhost'));
  assert.throws(() => assertLoopbackBind('0.0.0.0'), /Refusing to listen/);
  assert.throws(() => assertLoopbackBind('192.168.1.5'), /no login/);
});

test('rejects requests with a non-local Host header (DNS rebinding)', async () => {
  const res = await new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: server.address().port, path: '/api/plaid/items', headers: { host: 'evil.example.com' } },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(res.statusCode, 403);
});

test('without keys, Plaid routes return 503 but the rest of the API works', async () => {
  const app = createApp(openDb(':memory:'), { plaidClient: null, env: {} });
  const s = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  try {
    const b = `http://localhost:${s.address().port}/api`;
    assert.deepEqual(await (await fetch(b + '/plaid/status')).json(), { configured: false, environment: null });
    assert.equal((await fetch(b + '/plaid/items')).status, 503);
    assert.equal((await fetch(b + '/transactions')).status, 200);
  } finally {
    s.close();
  }
});

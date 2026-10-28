import { Router } from 'express';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { decrypt, encrypt, loadKey } from './crypto.js';
import { HttpError, str } from './validate.js';

const MAX_SYNC_RESTARTS = 3;

export function createPlaidClient(env = process.env) {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) return null;
  const plaidEnv = env.PLAID_ENV || 'sandbox';
  const basePath = PlaidEnvironments[plaidEnv];
  if (!basePath) throw new Error(`PLAID_ENV must be one of: ${Object.keys(PlaidEnvironments).join(', ')}`);
  return new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID, 'PLAID-SECRET': env.PLAID_SECRET } },
    }),
  );
}

const toCents = (amount) => Math.round(Math.abs(Number(amount) || 0) * 100);
const nullableCents = (amount) => (amount == null ? null : Math.round(Number(amount) * 100));

// Plaid personal_finance_category -> the app's categories.
export function mapCategory(tx) {
  const primary = tx.personal_finance_category?.primary;
  const detailed = tx.personal_finance_category?.detailed;
  if (tx.amount < 0 && primary === 'INCOME') return 'Income';
  if (detailed === 'FOOD_AND_DRINK_GROCERIES') return 'Groceries';
  if (primary === 'FOOD_AND_DRINK') return 'Dining out';
  if (primary === 'TRANSPORTATION' || primary === 'TRAVEL') return 'Transport';
  if (['ENTERTAINMENT', 'PERSONAL_CARE', 'GENERAL_MERCHANDISE'].includes(primary)) return 'Leisure';
  if (['RENT_AND_UTILITIES', 'LOAN_PAYMENTS', 'HOME_IMPROVEMENT', 'MEDICAL', 'GENERAL_SERVICES', 'GOVERNMENT_AND_NON_PROFIT', 'BANK_FEES'].includes(primary)) {
    return 'Rent & bills';
  }
  return tx.amount < 0 ? 'Income' : 'Other';
}

// Moves between your own accounts and card payments would be counted twice, so they are not imported.
function isInternalTransfer(tx) {
  const primary = tx.personal_finance_category?.primary;
  return (
    primary === 'TRANSFER_IN' ||
    primary === 'TRANSFER_OUT' ||
    tx.personal_finance_category?.detailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
  );
}

// Plaid failures are reduced to an allow-listed message and code. The original error is never
// kept or logged: transport (axios) errors carry request headers and bodies, which contain
// PLAID-SECRET and access tokens.
export class PlaidApiError extends HttpError {
  constructor(error) {
    const data = error?.response?.data;
    if (data) {
      super(502, data.display_message || data.error_message || 'Plaid request failed');
      this.code = typeof data.error_code === 'string' ? data.error_code : null;
    } else {
      super(502, 'Could not reach Plaid. Check your connection and try again.');
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
}

async function plaidCall(fn) {
  try {
    return (await fn()).data;
  } catch (error) {
    throw new PlaidApiError(error);
  }
}

export function createPlaidService({ db, client, key }) {
  const itemRow = (id) => db.prepare('SELECT * FROM plaid_items WHERE id = ?').get(id);
  const accessToken = (item) => decrypt(item.access_token_enc, key);

  function saveAccounts(itemId, accounts) {
    const upsert = db.prepare(
      `INSERT INTO plaid_accounts (account_id, item_id, name, mask, type, subtype, current_cents, available_cents, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id) DO UPDATE SET name = excluded.name, mask = excluded.mask, type = excluded.type,
         subtype = excluded.subtype, current_cents = excluded.current_cents,
         available_cents = excluded.available_cents, currency = excluded.currency`,
    );
    for (const a of accounts) {
      upsert.run(
        a.account_id,
        itemId,
        a.name || a.official_name || 'Account',
        a.mask ?? null,
        a.type ?? null,
        a.subtype ?? null,
        nullableCents(a.balances?.current),
        nullableCents(a.balances?.available),
        a.balances?.iso_currency_code ?? null,
      );
    }
  }

  async function refreshAccounts(item) {
    const token = accessToken(item);
    const data = await plaidCall(() => client.accountsGet({ access_token: token }));
    saveAccounts(item.item_id, data.accounts);
  }

  async function linkToken() {
    const request = {
      user: { client_user_id: 'local-user' },
      client_name: 'Kept',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    };
    if (process.env.PLAID_REDIRECT_URI) request.redirect_uri = process.env.PLAID_REDIRECT_URI;
    const data = await plaidCall(() => client.linkTokenCreate(request));
    return { link_token: data.link_token };
  }

  async function exchange(publicToken, institutionName) {
    const data = await plaidCall(() => client.itemPublicTokenExchange({ public_token: publicToken }));
    const token = data.access_token;

    // Load accounts before saving anything. The public token is single-use, so if this fails the
    // new Item would otherwise be left stored but half-initialized: revoke it instead.
    let accounts;
    try {
      accounts = (await plaidCall(() => client.accountsGet({ access_token: token }))).accounts;
    } catch (error) {
      await plaidCall(() => client.itemRemove({ access_token: token })).catch(() => {});
      throw error;
    }

    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO plaid_items (item_id, institution_name, access_token_enc) VALUES (?, ?, ?)
         ON CONFLICT (item_id) DO UPDATE SET access_token_enc = excluded.access_token_enc, institution_name = excluded.institution_name`,
      ).run(data.item_id, institutionName, encrypt(token, key));
      saveAccounts(data.item_id, accounts);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      await plaidCall(() => client.itemRemove({ access_token: token })).catch(() => {});
      throw error;
    }
    const item = db.prepare('SELECT id, institution_name FROM plaid_items WHERE item_id = ?').get(data.item_id);
    return { id: item.id, institution_name: item.institution_name };
  }

  // Pulls every page from the stored cursor, then applies it and advances the cursor in one DB transaction.
  async function syncItem(item) {
    const token = accessToken(item);
    let result;
    for (let attempt = 0; ; attempt++) {
      const added = [];
      const modified = [];
      const removed = [];
      let cursor = item.cursor || undefined;
      try {
        for (let hasMore = true; hasMore; ) {
          const data = await plaidCall(() =>
            client.transactionsSync({ access_token: token, cursor, count: 500 }),
          );
          added.push(...data.added);
          modified.push(...data.modified);
          removed.push(...data.removed);
          cursor = data.next_cursor;
          hasMore = data.has_more;
        }
        result = { added, modified, removed, cursor };
        break;
      } catch (error) {
        if (error.code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && attempt < MAX_SYNC_RESTARTS) continue;
        throw error;
      }
    }

    const stats = { added: 0, modified: 0, removed: 0, skipped: 0 };
    const upsert = db.prepare(
      `INSERT INTO transactions (type, amount_cents, category, description, date, plaid_transaction_id, account_id, pending, item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL DO UPDATE SET
         type = excluded.type, amount_cents = excluded.amount_cents, description = excluded.description,
         date = excluded.date, account_id = excluded.account_id, pending = excluded.pending, item_id = excluded.item_id`,
    );
    const remove = db.prepare('DELETE FROM transactions WHERE plaid_transaction_id = ?');

    db.exec('BEGIN');
    try {
      for (const [list, key2] of [[result.added, 'added'], [result.modified, 'modified']]) {
        for (const tx of list) {
          const cents = toCents(tx.amount);
          if (!cents || isInternalTransfer(tx) || (tx.iso_currency_code && tx.iso_currency_code !== 'USD')) {
            if (key2 === 'modified') remove.run(tx.transaction_id);
            stats.skipped++;
            continue;
          }
          upsert.run(
            tx.amount < 0 ? 'income' : 'expense',
            cents,
            mapCategory(tx),
            (tx.merchant_name || tx.name || '').slice(0, 120),
            tx.date,
            tx.transaction_id,
            tx.account_id ?? null,
            tx.pending ? 1 : 0,
            item.item_id,
          );
          stats[key2]++;
        }
      }
      for (const tx of result.removed) {
        stats.removed += remove.run(tx.transaction_id).changes;
      }
      db.prepare('UPDATE plaid_items SET cursor = ?, last_synced_at = ? WHERE id = ?').run(
        result.cursor ?? null,
        new Date().toISOString(),
        item.id,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    await refreshAccounts(item);
    return stats;
  }

  async function syncAll() {
    const totals = { added: 0, modified: 0, removed: 0, skipped: 0, errors: [] };
    for (const item of db.prepare('SELECT * FROM plaid_items ORDER BY id').all()) {
      try {
        const stats = await syncItem(item);
        for (const k of ['added', 'modified', 'removed', 'skipped']) totals[k] += stats[k];
      } catch (error) {
        totals.errors.push({ item_id: item.id, institution_name: item.institution_name, error: error.message, code: error.code ?? null });
      }
    }
    return totals;
  }

  async function removeItem(id) {
    const item = itemRow(id);
    if (!item) throw new HttpError(404, 'bank connection not found');
    const token = accessToken(item);
    try {
      await plaidCall(() => client.itemRemove({ access_token: token }));
    } catch (error) {
      if (error.code !== 'ITEM_NOT_FOUND') throw error;
    }
    db.exec('BEGIN');
    try {
      // Imported rows are removed with their bank. A re-link creates a new Item that may carry new
      // transaction ids for the same history, so keeping them would import everything twice.
      db.prepare('DELETE FROM transactions WHERE item_id = ?').run(item.item_id);
      db.prepare('DELETE FROM plaid_accounts WHERE item_id = ?').run(item.item_id);
      db.prepare('DELETE FROM plaid_items WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function listItems() {
    const accounts = db.prepare('SELECT * FROM plaid_accounts ORDER BY name').all();
    return db
      .prepare('SELECT id, item_id, institution_name, last_synced_at FROM plaid_items ORDER BY id')
      .all()
      .map((item) => ({
        id: item.id,
        institution_name: item.institution_name,
        last_synced_at: item.last_synced_at,
        accounts: accounts.filter((a) => a.item_id === item.item_id).map(({ item_id, ...a }) => a),
      }));
  }

  return { linkToken, exchange, syncAll, removeItem, listItems, syncItem };
}

export function createPlaidRouter({ db, client, env = process.env }) {
  const router = Router();
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  router.get('/status', (_req, res) => {
    res.json({ configured: Boolean(client), environment: client ? env.PLAID_ENV || 'sandbox' : null });
  });

  if (!client) {
    router.use((_req, _res, next) =>
      next(new HttpError(503, 'Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in server/.env.')),
    );
    return router;
  }

  const service = createPlaidService({ db, client, key: loadKey(env.TOKEN_ENCRYPTION_KEY) });

  router.post('/link-token', wrap(async (_req, res) => res.json(await service.linkToken())));

  router.post('/exchange', wrap(async (req, res) => {
    const publicToken = str(req.body?.public_token, 'public_token');
    const institution = str(req.body?.institution_name, 'institution_name', { optional: true }) ?? '';
    res.status(201).json(await service.exchange(publicToken, institution.slice(0, 80)));
  }));

  router.get('/items', (_req, res) => res.json(service.listItems()));

  router.post('/sync', wrap(async (_req, res) => res.json(await service.syncAll())));

  router.delete('/items/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'invalid id');
    await service.removeItem(id);
    res.status(204).end();
  }));

  return router;
}

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

let server;
let base;

before(async () => {
  const app = createApp(openDb(':memory:'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
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

test('transactions: create, validate, filter, update, delete', async () => {
  const bad = await call('POST', '/transactions', { type: 'expense', amount_cents: 12.5, category: 'Food', date: '2026-10-01' });
  assert.equal(bad.status, 400);

  const a = await call('POST', '/transactions', { type: 'income', amount_cents: 300000, category: 'Salary', date: '2026-10-01' });
  const b = await call('POST', '/transactions', { type: 'expense', amount_cents: 4500, category: 'Food', description: 'Groceries', date: '2026-10-03' });
  await call('POST', '/transactions', { type: 'expense', amount_cents: 9900, category: 'Food', date: '2026-09-20' });
  assert.equal(a.status, 201);
  assert.equal(b.body.description, 'Groceries');

  const oct = await call('GET', '/transactions?month=2026-10');
  assert.equal(oct.body.length, 2);
  const food = await call('GET', '/transactions?category=Food&type=expense');
  assert.equal(food.body.length, 2);

  const upd = await call('PUT', `/transactions/${b.body.id}`, { ...b.body, amount_cents: 5000 });
  assert.equal(upd.body.amount_cents, 5000);

  assert.equal((await call('DELETE', `/transactions/${b.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/transactions/${b.body.id}`)).status, 404);
});

test('budgets: upsert and spend progress', async () => {
  await call('POST', '/transactions', { type: 'expense', amount_cents: 2000, category: 'Fun', date: '2026-11-02' });
  await call('PUT', '/budgets', { category: 'Fun', month: '2026-11', limit_cents: 10000 });
  await call('PUT', '/budgets', { category: 'Fun', month: '2026-11', limit_cents: 15000 });

  const list = await call('GET', '/budgets?month=2026-11');
  assert.equal(list.body.length, 1);
  assert.deepEqual(
    [list.body[0].limit_cents, list.body[0].spent_cents, list.body[0].remaining_cents],
    [15000, 2000, 13000],
  );
  assert.equal((await call('DELETE', `/budgets/${list.body[0].id}`)).status, 204);
});

test('goals: create, contribute, clamp at zero, delete', async () => {
  const g = await call('POST', '/goals', { name: 'Laptop', target_cents: 120000, deadline: '2027-01-01' });
  assert.equal(g.status, 201);
  assert.equal(g.body.saved_cents, 0);

  const c = await call('POST', `/goals/${g.body.id}/contribute`, { amount_cents: 25000 });
  assert.equal(c.body.saved_cents, 25000);
  const w = await call('POST', `/goals/${g.body.id}/contribute`, { amount_cents: -99999 });
  assert.equal(w.body.saved_cents, 0);

  assert.equal((await call('POST', '/goals/999/contribute', { amount_cents: 1 })).status, 404);
  assert.equal((await call('DELETE', `/goals/${g.body.id}`)).status, 204);
});

test('summary: totals, categories and 6-month trend', async () => {
  const s = await call('GET', '/summary?month=2026-10');
  assert.equal(s.body.income_cents, 300000);
  assert.equal(s.body.expense_cents, 0);
  assert.equal(s.body.trend.length, 6);
  assert.equal(s.body.trend[5].month, '2026-10');
  assert.equal(s.body.trend[4].month, '2026-09');
  assert.equal(s.body.trend[4].expense_cents, 9900);
  assert.equal((await call('GET', '/summary?month=bad')).status, 400);
});

test('unknown api route returns JSON 404', async () => {
  const r = await call('GET', '/nope');
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'not found');
});

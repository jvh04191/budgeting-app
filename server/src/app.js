import express from 'express';
import cors from 'cors';
import { openDb } from './db.js';
import { createPlaidClient, createPlaidRouter } from './plaid.js';
import { localOnly } from './guard.js';
import { HttpError, str, cents, date, month, oneOf } from './validate.js';

const currentMonth = () => new Date().toISOString().slice(0, 7);

function addMonths(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function needId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid id');
  return id;
}

// The API holds bank data, so it only answers requests from this computer: other websites cannot
// read it (CORS allow-list), and the peer address and Host header are checked (see guard.js).

export function createApp(db = openDb(), options = {}) {
  const env = options.env ?? process.env;
  const plaidClient = options.plaidClient !== undefined ? options.plaidClient : createPlaidClient(env);
  const allowedOrigins = (env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((o) => o.trim());
  const allowedHosts = (env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

  const app = express();
  app.use(localOnly({ allowedHosts }));
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());
  app.use('/api/plaid', createPlaidRouter({ db, client: plaidClient, env }));

  // ---- transactions ----
  const txFromBody = (b) => ({
    type: oneOf(b.type, 'type', ['income', 'expense']),
    amount_cents: cents(b.amount_cents, 'amount_cents'),
    category: str(b.category, 'category'),
    description: str(b.description, 'description', { optional: true }) ?? '',
    date: date(b.date, 'date'),
  });

  app.get('/api/transactions', (req, res) => {
    const where = [];
    const args = [];
    if (req.query.month) {
      where.push('substr(date, 1, 7) = ?');
      args.push(month(req.query.month));
    }
    if (req.query.type) {
      where.push('type = ?');
      args.push(oneOf(req.query.type, 'type', ['income', 'expense']));
    }
    if (req.query.category) {
      where.push('category = ?');
      args.push(req.query.category);
    }
    const sql = `SELECT * FROM transactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC, id DESC`;
    res.json(db.prepare(sql).all(...args));
  });

  app.post('/api/transactions', (req, res) => {
    const t = txFromBody(req.body ?? {});
    const info = db
      .prepare('INSERT INTO transactions (type, amount_cents, category, description, date) VALUES (?, ?, ?, ?, ?)')
      .run(t.type, t.amount_cents, t.category, t.description, t.date);
    res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid));
  });

  app.put('/api/transactions/:id', (req, res) => {
    const id = needId(req);
    const t = txFromBody(req.body ?? {});
    const info = db
      .prepare('UPDATE transactions SET type = ?, amount_cents = ?, category = ?, description = ?, date = ? WHERE id = ?')
      .run(t.type, t.amount_cents, t.category, t.description, t.date, id);
    if (!info.changes) throw new HttpError(404, 'transaction not found');
    res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id));
  });

  app.delete('/api/transactions/:id', (req, res) => {
    const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(needId(req));
    if (!info.changes) throw new HttpError(404, 'transaction not found');
    res.status(204).end();
  });

  // ---- budgets (one limit per category per month, with spend progress) ----
  app.get('/api/budgets', (req, res) => {
    const m = req.query.month ? month(req.query.month) : currentMonth();
    const rows = db
      .prepare(
        `SELECT b.id, b.category, b.month, b.limit_cents,
                COALESCE((SELECT SUM(amount_cents) FROM transactions t
                          WHERE t.type = 'expense' AND t.category = b.category
                            AND substr(t.date, 1, 7) = b.month), 0) AS spent_cents
         FROM budgets b WHERE b.month = ? ORDER BY b.category`,
      )
      .all(m);
    res.json(rows.map((r) => ({ ...r, remaining_cents: r.limit_cents - r.spent_cents })));
  });

  app.put('/api/budgets', (req, res) => {
    const b = req.body ?? {};
    const category = str(b.category, 'category');
    const m = month(b.month);
    const limit = cents(b.limit_cents, 'limit_cents');
    db.prepare(
      `INSERT INTO budgets (category, month, limit_cents) VALUES (?, ?, ?)
       ON CONFLICT (category, month) DO UPDATE SET limit_cents = excluded.limit_cents`,
    ).run(category, m, limit);
    res.json(db.prepare('SELECT * FROM budgets WHERE category = ? AND month = ?').get(category, m));
  });

  app.delete('/api/budgets/:id', (req, res) => {
    const info = db.prepare('DELETE FROM budgets WHERE id = ?').run(needId(req));
    if (!info.changes) throw new HttpError(404, 'budget not found');
    res.status(204).end();
  });

  // ---- goals ----
  const goalFromBody = (b) => ({
    name: str(b.name, 'name'),
    target_cents: cents(b.target_cents, 'target_cents'),
    saved_cents: b.saved_cents == null ? 0 : cents(b.saved_cents, 'saved_cents', { allowZero: true }),
    deadline: date(b.deadline, 'deadline', { optional: true }),
  });

  app.get('/api/goals', (_req, res) => {
    res.json(db.prepare('SELECT * FROM goals ORDER BY id').all());
  });

  app.post('/api/goals', (req, res) => {
    const g = goalFromBody(req.body ?? {});
    const info = db
      .prepare('INSERT INTO goals (name, target_cents, saved_cents, deadline) VALUES (?, ?, ?, ?)')
      .run(g.name, g.target_cents, g.saved_cents, g.deadline);
    res.status(201).json(db.prepare('SELECT * FROM goals WHERE id = ?').get(info.lastInsertRowid));
  });

  app.put('/api/goals/:id', (req, res) => {
    const id = needId(req);
    const g = goalFromBody(req.body ?? {});
    const info = db
      .prepare('UPDATE goals SET name = ?, target_cents = ?, saved_cents = ?, deadline = ? WHERE id = ?')
      .run(g.name, g.target_cents, g.saved_cents, g.deadline, id);
    if (!info.changes) throw new HttpError(404, 'goal not found');
    res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(id));
  });

  // Add (or withdraw, with a negative amount) money toward a goal.
  app.post('/api/goals/:id/contribute', (req, res) => {
    const id = needId(req);
    const amount = req.body?.amount_cents;
    if (!Number.isInteger(amount) || amount === 0) throw new HttpError(400, 'amount_cents must be a non-zero integer');
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
    if (!goal) throw new HttpError(404, 'goal not found');
    const saved = Math.max(0, goal.saved_cents + amount);
    db.prepare('UPDATE goals SET saved_cents = ? WHERE id = ?').run(saved, id);
    res.json({ ...goal, saved_cents: saved });
  });

  app.delete('/api/goals/:id', (req, res) => {
    const info = db.prepare('DELETE FROM goals WHERE id = ?').run(needId(req));
    if (!info.changes) throw new HttpError(404, 'goal not found');
    res.status(204).end();
  });

  // ---- summary: totals, spending by category, and a 6-month trend ----
  app.get('/api/summary', (req, res) => {
    const m = req.query.month ? month(req.query.month) : currentMonth();
    const monthTotals = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents END), 0) AS income_cents,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense_cents
       FROM transactions WHERE substr(date, 1, 7) = ?`,
    );
    const totals = monthTotals.get(m);
    const byCategory = db
      .prepare(
        `SELECT category, SUM(amount_cents) AS total_cents FROM transactions
         WHERE type = 'expense' AND substr(date, 1, 7) = ?
         GROUP BY category ORDER BY total_cents DESC`,
      )
      .all(m);
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const tm = addMonths(m, -i);
      trend.push({ month: tm, ...monthTotals.get(tm) });
    }
    res.json({
      month: m,
      ...totals,
      net_cents: totals.income_cents - totals.expense_cents,
      by_category: byCategory,
      trend,
    });
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not found')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

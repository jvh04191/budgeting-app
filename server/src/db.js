import { DatabaseSync } from 'node:sqlite';

export function openDb(path = process.env.DB_PATH || 'budget.db') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      month TEXT NOT NULL,
      limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
      UNIQUE (category, month)
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_cents INTEGER NOT NULL CHECK (target_cents > 0),
      saved_cents INTEGER NOT NULL DEFAULT 0 CHECK (saved_cents >= 0),
      deadline TEXT
    );
  `);
  return db;
}

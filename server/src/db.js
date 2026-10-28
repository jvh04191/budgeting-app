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
    CREATE TABLE IF NOT EXISTS plaid_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL UNIQUE,
      institution_name TEXT NOT NULL DEFAULT '',
      access_token_enc TEXT NOT NULL,
      cursor TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS plaid_accounts (
      account_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES plaid_items(item_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mask TEXT,
      type TEXT,
      subtype TEXT,
      current_cents INTEGER,
      available_cents INTEGER,
      currency TEXT
    );
  `);

  // Columns added for Plaid-imported transactions (idempotent for existing databases).
  const columns = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
  if (!columns.includes('plaid_transaction_id')) db.exec('ALTER TABLE transactions ADD COLUMN plaid_transaction_id TEXT');
  if (!columns.includes('account_id')) db.exec('ALTER TABLE transactions ADD COLUMN account_id TEXT');
  if (!columns.includes('pending')) db.exec('ALTER TABLE transactions ADD COLUMN pending INTEGER NOT NULL DEFAULT 0');
  if (!columns.includes('item_id')) db.exec('ALTER TABLE transactions ADD COLUMN item_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(item_id)');
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_plaid ON transactions(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL',
  );
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

# Budgeting App

Web app for tracking income and expenses, monthly category budgets, savings goals and spending charts.

- `server/` — Express API backed by SQLite (Node's built-in `node:sqlite`, needs Node 22.13+). No auth yet.
- `client/` — frontend (pending design).

## Run the API

```bash
cd server
npm install
npm run dev     # http://localhost:3001
npm test
```

Set `PORT` or `DB_PATH` (default `budget.db`) to override.

## API

Amounts are integer cents. Dates are `YYYY-MM-DD`, months are `YYYY-MM`.

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/transactions` | GET filters: `month`, `type`, `category` |
| PUT/DELETE | `/api/transactions/:id` | |
| GET | `/api/budgets?month=` | includes `spent_cents` and `remaining_cents` |
| PUT | `/api/budgets` | upsert `{category, month, limit_cents}` |
| DELETE | `/api/budgets/:id` | |
| GET/POST | `/api/goals` | |
| PUT/DELETE | `/api/goals/:id` | |
| POST | `/api/goals/:id/contribute` | `{amount_cents}`, negative to withdraw |
| GET | `/api/summary?month=` | totals, spend by category, 6-month trend |

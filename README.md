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

## Bank linking (Plaid)

Link banks to import transactions and show balances. Imported spending flows into budgets, Today and Insights like manual entries.

1. Create a Plaid account and copy your keys from <https://dashboard.plaid.com/developers/keys>.
2. In `server/`, copy `.env.example` to `.env` and fill it in:
   - `PLAID_CLIENT_ID` and `PLAID_SECRET` (use the **Sandbox** secret while testing)
   - `PLAID_ENV=sandbox` (switch to `production` only after Plaid approves your account)
   - `TOKEN_ENCRYPTION_KEY`: generate with `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`. It encrypts bank tokens in the database; back it up, because losing it means re-linking your banks.
3. Restart the API, open the app, tap the top-right icon on Today, and choose **Link a bank**. In Sandbox use the test login `user_good` / `pass_good`.

How it behaves:
- Transactions sync on page load and with **Sync now**, using Plaid's cursor-based sync (changes and removals are applied, nothing is duplicated). Edits you make to an imported entry's category are kept.
- Transfers between your own accounts and credit card payments are skipped so money is not counted twice. Non-USD transactions are skipped.
- Bank access tokens are encrypted at rest (AES-256-GCM) and never sent to the browser.
- Removing a bank deletes the transactions imported from it (so re-linking can never duplicate history); entries you added yourself are kept.
- Plaid errors are reduced to a safe message and code before they are returned or logged, so keys and tokens cannot leak into logs.
- The API listens on `127.0.0.1` only and refuses to start on any other address. It also rejects requests whose network peer is not this computer or whose hostname is not local, and allows CORS only from `http://localhost:5173`. There is still **no login**, so do not expose the API to a network or host it publicly until user accounts are added.
- Balances come from Plaid's cached account data (no extra balance fee). Production also needs a redirect URI (`PLAID_REDIRECT_URI`) for OAuth banks.

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
| GET | `/api/plaid/status` | whether Plaid is configured and which environment |
| POST | `/api/plaid/link-token` | create a Plaid Link token |
| POST | `/api/plaid/exchange` | `{public_token, institution_name}`; stores the encrypted access token |
| GET | `/api/plaid/items` | linked banks with accounts and balances (never tokens) |
| POST | `/api/plaid/sync` | import new, changed and removed transactions |
| DELETE | `/api/plaid/items/:id` | disconnect a bank at Plaid and locally; removes its imported transactions |

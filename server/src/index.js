import { createApp } from './app.js';
import { assertLoopbackBind } from './guard.js';

const port = process.env.PORT || 3001;
// Loopback only: the API serves bank data and has no login.
const host = process.env.HOST || '127.0.0.1';
assertLoopbackBind(host);
createApp().listen(port, host, () => console.log(`budgeting API listening on http://${host}:${port}`));

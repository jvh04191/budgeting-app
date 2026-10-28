import { createApp } from './app.js';

const port = process.env.PORT || 3001;
createApp().listen(port, () => console.log(`budgeting API listening on http://localhost:${port}`));

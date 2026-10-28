# Kept client

Mobile-first React + Vite frontend for Kept.

## Run locally

Use Node.js 18 or newer. Start the API first from the repository root:

```bash
cd server
npm install
npm run dev
```

The API runs at `http://localhost:3001`. In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to port 3001.

## Production build

```bash
npm run build
npm run preview
```

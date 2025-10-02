# Mixtli Backend — iDrive e2 (Root 200 JSON)
Build: npm install --omit=dev
Start: node server.js

Env (Render → Environment):
E2_ENDPOINT=https://x3j7.or2.idrivee2-60.com
E2_ACCESS_KEY_ID=...
E2_SECRET_ACCESS_KEY=...
E2_BUCKET=1mixtlinube3
E2_PUBLIC_BASE=https://x3j7.or2.idrivee2-60.com/1mixtlinube3
ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:5173"]
NODE_VERSION=20

Rutas: GET /api/salud, GET /api/debug-env, POST /api/presign, POST /api/complete, GET /api/list
(Con y sin /api)

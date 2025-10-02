# Mixtli Backend — iDrive e2 (Proxy Upload para evitar CORS)
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

Rutas clave:
- POST /api/upload-direct?key=albums/<album>/<archivo>   (body = binario del archivo; Content-Type = MIME del archivo)
- POST /api/complete   { "key": "albums/.../archivo.ext" }  → genera thumb 480x320
- GET  /api/list
- GET  /api/salud
- GET  /api/debug-env
(Con y sin /api)

Ejemplo front (Vite):
const key = `albums/${albumId}/${file.name}`;
await fetch(`${import.meta.env.VITE_API_BASE}/api/upload-direct?key=${encodeURIComponent(key)}`, {
  method: "POST",
  headers: { "Content-Type": file.type || "application/octet-stream" },
  body: file
});
await fetch(`${import.meta.env.VITE_API_BASE}/api/complete`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key })
});

# Mixtli Relay — Admin (delete/rename/trash/restore)

## Start (Render)
Build: `npm install --omit=dev`
Start: `node server.js`

Env:
S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=auto
S3_BUCKET=1mixtlinube3
S3_ACCESS_KEY_ID=<tu_key_e2>
S3_SECRET_ACCESS_KEY=<tu_secret_e2>
S3_FORCE_PATH_STYLE=true
ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:5173"]
ADMIN_TOKEN=<pon-un-token-fuerte>

## Rutas admin (usa header x-admin-token: <ADMIN_TOKEN>)
POST /api/admin/ping
POST /api/admin/item/delete   { "key":"albums/demo/foto.jpg" }
POST /api/admin/item/rename   { "from":"albums/demo/foto.jpg", "to":"albums/demo/vacaciones.jpg" }
POST /api/admin/album/trash   { "album":"demo" }
POST /api/admin/album/restore { "album":"demo" }
GET  /api/admin/trash/list?prefix=trash/

Nota: delete y trash no destruyen permanentemente; mueven a `trash/<timestamp>/...`. Restore toma el snapshot más reciente.

## Rutas públicas (se conservan)
POST /api/upload?key=albums/<album>/<archivo>  (FormData: file)
POST /api/presign-get { key, expiresIn }
GET  /api/salud
GET  /api/diag

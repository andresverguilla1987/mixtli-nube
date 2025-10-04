# Mixtli Backend (Render) — presign + list

Endpoints:
- `GET /api/list?album=personal`
- `GET /api/album/list?album=personal` (alias)
- `POST /api/presign` → body `{ filename, album, contentType }` o `{ key }`
- `GET /api/diag`, `GET /api/salud`

## Env (Render)
```
S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=us-east-1
S3_BUCKET=mixtlinube3
S3_ACCESS_KEY_ID=... (E2)
S3_SECRET_ACCESS_KEY=... (E2)
S3_FORCE_PATH_STYLE=true
PUBLIC_BASE=https://x3j7.or2.idrivee2-60.com/mixtlinube3
ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:8888"]
PORT=8080
```

## Deploy on Render
- Runtime: Node 18+
- Build: `npm i --no-audit --no-fund`
- Start: `node server.js`
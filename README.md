# Mixtli Backend — iDrive e2 (S3 compatible)

Rutas:
- GET /api/salud
- GET /api/list
- POST /api/presign
- POST /api/complete

## Variables de entorno
E2_ENDPOINT=https://<ENDPOINT_DE_TU_REGION>          # desde la consola e2
E2_ACCESS_KEY_ID=********************************
E2_SECRET_ACCESS_KEY=****************************
E2_BUCKET=mixtli
E2_PUBLIC_BASE=https://tu-dominio-publico-e2 (opcional, si sirves archivos públicamente)
ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:5173"]
NODE_VERSION=20

## Render
Build command: npm install --omit=dev
Start command: node server.js

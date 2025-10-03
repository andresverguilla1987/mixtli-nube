# Mixtli API (Render)

Endpoints:
- GET / -> health
- GET /api/diag
- GET /api/list?album=personal
- GET /api/album/list?album=personal
- POST /api/presign { key, contentType }
- GET  /api/presign-get?key=...&contentType=...

## Env
- E2_ENDPOINT=https://s3.us-???-1.idrivee2-XX.com
- E2_REGION=us-east-1
- E2_ACCESS_KEY_ID=...
- E2_SECRET_ACCESS_KEY=...
- E2_BUCKET=mixtli-{tu-bucket}
- ALLOWED_ORIGINS=["https://<tu-sitio-netlify>.netlify.app"]

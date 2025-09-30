
# Mixtli Relay Upload (Render)
Subida **vía servidor** (sin CORS en el bucket) + descarga privada con presign GET.

## Deploy (Render)
- **Build:** `npm install --no-audit --no-fund`
- **Start:** `node server.js`
- **Health Check Path:** `/salud` (opcional)

## Env vars
```
S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=us-east-1
S3_BUCKET=1mixtlinube3
S3_ACCESS_KEY_ID=<tu key>
S3_SECRET_ACCESS_KEY=<tu secret>
ALLOWED_ORIGINS=["https://<tu-netlify>.netlify.app","http://localhost:8888"]
S3_FORCE_PATH_STYLE=true
```

## Endpoints
- `GET /salud`
- `GET /api/diag`
- `GET /api/check-bucket`
- `POST /api/upload` (form-data: `file`)
- `POST /api/presign-get` ({ key })
- (opcional) `POST /api/presign` para presigned PUT

## Smoke
```bash
curl -F "file=@./ping.bin" https://<tu-render>.onrender.com/api/upload
curl -s -H "Content-Type: application/json" -d '{"key":"uploads/..."}' https://<tu-render>.onrender.com/api/presign-get
```

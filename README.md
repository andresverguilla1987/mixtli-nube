
# Mixtli Relay • Lossless Upload
- Guarda **exactamente** los bytes recibidos (sin compresión / sin re-encode).
- Sube con metadatos: `original-name`, `original-size`, `sha256`.
- `ContentDisposition: inline; filename="<original>"` para que conserve el nombre al descargar.

## Endpoints
- `POST /api/upload` (file, album?)
- `GET  /api/health`
- `GET  /api/check-bucket`

## ENVs
S3_ENDPOINT=...
S3_REGION=us-east-1
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
ALLOWED_ORIGINS=["https://<tu-netlify>.netlify.app","http://localhost:8888"]

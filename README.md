# Mixtli Transfer — Relay (sin CORS)
Sube el archivo al backend vía multipart `/api/upload` y el backend lo guarda en S3.
Evita CORS completamente.

- `POST /api/upload` (form-data, campo `file`)
- `GET /salud`

ENV: S3_ENDPOINT, S3_REGION, S3_FORCE_PATH_STYLE, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY

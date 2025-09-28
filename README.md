# Mixtli Transfer (presign sin Content-Type)
- Evita 403 por mismatch de Content-Type en S3-compatibles.
- Endpoints:
  - GET /salud
  - POST /api/presign  { filename } -> uploadUrl (PUT), downloadUrl (GET)

ENV esperados (IDrive e2):
S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=or2
S3_FORCE_PATH_STYLE=true
S3_BUCKET=1mixtlinube3
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...

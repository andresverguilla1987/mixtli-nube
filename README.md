# Mixtli Relay (IDrive e2 / S3 Presign)

Minimal Express server for Render to presign PUT uploads to an S3‑compatible bucket (IDrive e2).

## Deploy on Render

1. Create a **Web Service** (Node).
2. Build Command: `npm install --no-audit --no-fund`
3. Start Command: `node server.js`
4. Set Environment Variables:
   - `S3_BUCKET` (e.g., 1mixtlinube3)
   - `S3_ENDPOINT` (e.g., https://x3j7.or2.idrivee2-60.com)
   - `S3_REGION` = `us-east-1`
   - `S3_FORCE_PATH_STYLE` = `true`
   - `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
   - `ALLOWED_ORIGINS` = `["https://lovely-bienenstitch-6344a1.netlify.app"]`
5. (Optional) Health check path: `/salud`

## Endpoints

- `GET /salud` (200 JSON)
- `GET /api/health` (200 JSON)
- `GET /api/diag` (env visibility, no secrets)
- `GET /api/check-bucket` (HEAD Bucket via SDK)
- `POST /api/presign` → body: `{ "filename": "file.bin", "contentType": "application/octet-stream", "bytes": 123 }`
  - Response: `{ ok, url, key, expiresIn }`
  - Then `PUT` to the signed `url` with `Content-Type` header.

## Bucket CORS (IDrive e2)

Use JSON on the e2 console:
```json
[
  {
    "AllowedOrigins": ["https://lovely-bienenstitch-6344a1.netlify.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "x-amz-version-id"],
    "MaxAgeSeconds": 3600
  }
]
```

## Quick test

```bash
# Presign
curl -s https://<your-render>.onrender.com/api/presign     -H "Content-Type: application/json"     -d '{"filename":"ping.bin","contentType":"application/octet-stream","bytes":11}' | jq

# PUT the signed URL returned
curl -i -X PUT "<SIGNED_URL>" -H "Content-Type: application/octet-stream" --data-binary $'hola mundo'
```

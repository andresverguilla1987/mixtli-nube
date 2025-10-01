# Mixtli Relay Upload + Thumbs
Genera **thumbs 480x320 JPG** al completar subida con Sharp.

## Endpoints
- POST /api/presign, /api/presign-batch
- POST /api/complete  (genera thumb si es imagen)
- GET  /api/list      (incluye `thumbnail` por item)

## ENV
Ver `.env.example` (usa variables S3_* para R2).

## Run
npm install
npm start

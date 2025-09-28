# Mixtli Transfer — Backend (Stripe fail-fast)

## Novedades
- `REQUIRE_STRIPE=1` → obliga `STRIPE_SECRET_KEY` al arrancar (deploy falla si falta).
- `GET /api/diag/stripe` → diagnostica presencia y modo (test/live).

## Env (Render)
```
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<R2 access key>
S3_SECRET_ACCESS_KEY=<R2 secret>
ALLOWED_ORIGINS=["https://<tu-netlify>.netlify.app"]
PORT=10000

# Stripe
REQUIRE_STRIPE=1
STRIPE_SECRET_KEY=sk_test_xxx   # o sk_live_xxx
# STRIPE_WEBHOOK_SECRET=whsec_xxx (opcional si usas webhooks)
```

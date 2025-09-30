
# Mixtli Relay Upload (Álbumes)
Subida vía servidor (multer) + álbumes estilo Netflix.
- `POST /api/upload` acepta `album` (opcional) y sube a `albums/<album>/...` o `uploads/...`.
- `GET  /api/albums`  → lista nombres de álbum (CommonPrefixes).
- `GET  /api/list?album=Nombre&max=60&token=` → lista objetos del álbum (con paginación).
- `POST /api/presign-get { key }` → enlace temporal de lectura.
- `POST /api/presign-batch { keys: [...] }` → enlaces temporales en lote.

## Env
S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=us-east-1
S3_BUCKET=1mixtlinube3
S3_ACCESS_KEY_ID=<tu_key_e2>
S3_SECRET_ACCESS_KEY=<tu_secret_e2>
S3_FORCE_PATH_STYLE=true
ALLOWED_ORIGINS=["https://<tu-netlify>.netlify.app","http://localhost:8888"]

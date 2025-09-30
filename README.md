
# Mixtli Relay Upload (Álbumes + Favoritos + Lightbox-ready)
Endpoints:
- POST /api/upload (file, album?) → guarda en albums/<album>/ o uploads/
- GET  /api/albums → lista álbumes
- GET  /api/list?album=... → lista items (excluye manifest.json)
- POST /api/presign-get { key } → URL firmada (15m por default)
- POST /api/presign-batch { keys:[...] } → URLs firmadas en lote
- GET  /api/album-manifest?album=... → obtiene manifest.json (favorites)
- POST /api/album-manifest { album, favorites:[keys] } → guarda manifest.json

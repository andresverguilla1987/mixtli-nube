Mixtli backend: rutas alias /api/*

Qué es
- routesAliases.js monta las rutas con y sin prefijo /api para evitar 404 del front.

Cómo usar
1) Copia routesAliases.js al mismo folder que tu server.js (en Render).
2) En server.js, después de configurar CORS y antes de app.listen:
     import { mountRoutes } from "./routesAliases.js";
     mountRoutes(app);
3) Redeploy en Render.

Cómo integrar con tu lógica real
- Si ya tienes funciones para listar (por ejemplo listObjectsV2 hacia S3/E2), pásalas:
     mountRoutes(app, {
       listHandler: tuListHandler,
       albumListHandler: tuAlbumListHandler,
       zipHandler: tuZipHandler,
       pinCheckHandler: tuPinCheckHandler,
       healthHandler: tuHealthHandler
     });

Con esto el front dejará de recibir 404 en:
/api/album/list, /api/list, /api/album/zip y /api/album/pin/check

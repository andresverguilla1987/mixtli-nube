Mixtli backend CORS patch

Qué incluye
- corsMw.js  → middleware CORS que permite Origin = null (server→server como Netlify→Render) y valida ALLOWED_ORIGINS.
- server.example.js → ejemplo mínimo de cómo montarlo si quieres probar local.

Cómo aplicarlo en tu server actual (server.js):
1) Copia 'corsMw.js' junto a tu server.js (mismo folder).
2) En la parte superior de tu server.js añade:
   import { corsMw } from "./corsMw.js";
3) Antes de tus rutas (app.get/post...), monta:
   app.use(corsMw);
   app.options("*", corsMw);
4) Asegúrate de tener la env en Render:
   ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:8888"]

Redeploy y listo. Con esto desaparece el error 'Origin not allowed: null'.

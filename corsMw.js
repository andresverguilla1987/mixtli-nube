import cors from "cors";

const allowed = (() => {
  try { return JSON.parse(process.env.ALLOWED_ORIGINS || "[]"); }
  catch { return []; }
})();

// CORS middleware that also allows Origin null (server→server, Netlify→Render)
export const corsMw = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow null origin
    if (allowed.some(o => origin.startsWith(o))) return cb(null, true);
    return cb(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","x-album-token"],
  credentials: false,
});

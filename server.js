import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/ping", (_req, res) => res.json({ message: "pong" }));

// placeholder: add your routes here
// app.post("/api/...", (req, res) => { ... });

app.listen(PORT, () => {
  console.log(`Mixtli Nube API escuchando en :${PORT}`);
});

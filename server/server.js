// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const mediaRoutes = require("./routes/media");

const app = express();
const PORT = process.env.PORT || 4000;

// The frontend is static files served separately (npx serve / python http.server
// per the main README) so this is a real cross-origin API from the browser's
// point of view — CORS has to be explicitly open to that origin.
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*",
}));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/media", mediaRoutes);

// Multer errors (e.g. file too large) land here if they escape the inline
// handler in routes/media.js.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`CARRENTPE media server running on http://localhost:${PORT}`);
});

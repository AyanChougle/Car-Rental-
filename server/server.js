// server.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const mediaRoutes = require("./routes/media");
const paymentRoutes = require("./routes/payments");
const adminExportRoutes = require("./routes/adminExport");

const app = express();

const PORT = Number(process.env.PORT || 4001);
const NODE_ENV = process.env.NODE_ENV || "development";

app.disable("x-powered-by");

app.set("trust proxy", 1);

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

const configuredOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:5500,http://127.0.0.1:5500"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (NODE_ENV === "production" && configuredOrigins.length === 0) {
  console.error(
    "[server] ALLOWED_ORIGINS must be configured in production."
  );

  process.exit(1);
}

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests such as curl/Postman.
      if (!origin) {
        return callback(null, true);
      }

      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked for origin: ${origin}`)
      );
    },

    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],

    credentials: false,

    maxAge: 600,
  })
);

// ------------------------------------------------------------
// BODY LIMIT
// ------------------------------------------------------------

app.use(
  express.json({
    limit: "100kb",
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "100kb",
  })
);

// ------------------------------------------------------------
// GLOBAL API RATE LIMIT
// ------------------------------------------------------------

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error:
      "Too many requests. Please slow down and try again shortly.",
  },
});

app.use("/api", apiLimiter);

// ------------------------------------------------------------
// HEALTH
// ------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "KRUIZLY API",
    environment: NODE_ENV,
    time: new Date().toISOString(),
  });
});

// ------------------------------------------------------------
// ROUTES
// ------------------------------------------------------------

app.use("/api/media", mediaRoutes);

app.use("/api/payments", paymentRoutes);

app.use("/api/admin", adminExportRoutes);

// ------------------------------------------------------------
// 404
// ------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: "API endpoint not found.",
  });
});

// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error("[server error]", err);

  if (err.message && err.message.startsWith("CORS blocked")) {
    return res.status(403).json({
      error: "Origin not allowed.",
    });
  }

  return res.status(500).json({
    error: "Something went wrong on the server.",
  });
});

// ------------------------------------------------------------
// START
// ------------------------------------------------------------

app.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log("       KRUIZLY BACKEND");
  console.log("========================================");
  console.log(`Environment : ${NODE_ENV}`);
  console.log(`Port        : ${PORT}`);
  console.log(`API         : http://localhost:${PORT}`);
  console.log("");
  console.log("Allowed origins:");

  for (const origin of configuredOrigins) {
    console.log(`  - ${origin}`);
  }

  console.log("========================================");
  console.log("");
});
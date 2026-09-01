// server/server.js
"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./config/database");

const mediaRoutes = require("./routes/media");
const paymentRoutes = require("./routes/payments");
const adminExportRoutes = require("./routes/adminExport");
const invoiceRoutes = require("./routes/invoice");
const userRoutes = require("./routes/users");
const vehicleRoutes = require("./routes/vehicles");
const bookingRoutes = require("./routes/bookings");
const couponRoutes = require("./routes/coupons");
const verificationRoutes = require("./routes/verification");

const app = express();

const PORT = Number(process.env.PORT || 4001);
const NODE_ENV = process.env.NODE_ENV || "development";

app.disable("x-powered-by");
app.set("trust proxy", 1);

// ------------------------------------------------------------
// SECURITY
// ------------------------------------------------------------

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

const defaultOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "https://ayanchougle.github.io",
  "https://ayanchougle.github.io/Car-Rental-/"
];

const envOrigins = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const configuredOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const isAllowed =
        configuredOrigins.includes(origin) ||
        origin.endsWith(".github.io") ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin"
    ],
    credentials: true,
    maxAge: 600
  })
);

// ------------------------------------------------------------
// BODY LIMIT
// ------------------------------------------------------------

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// ------------------------------------------------------------
// GLOBAL API RATE LIMIT
// ------------------------------------------------------------

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please slow down and try again shortly."
  }
});

app.use("/api", apiLimiter);

// ------------------------------------------------------------
// HEALTH CHECK WITH MYSQL POOL STATUS
// ------------------------------------------------------------

app.get("/api/health", async (req, res) => {
  const dbHealth = await db.testConnection();
  res.json({
    ok: true,
    service: "KRUIZLY Production Backend",
    environment: NODE_ENV,
    time: new Date().toISOString(),
    database: {
      connected: dbHealth.connected,
      serverTime: dbHealth.serverTime || null,
      error: dbHealth.error || null
    }
  });
});

// ------------------------------------------------------------
// ROUTE MOUNTING
// ------------------------------------------------------------

app.use("/api/users", userRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/admin", adminExportRoutes);

// ------------------------------------------------------------
// 404 HANDLER
// ------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint not found.",
    path: req.originalUrl,
    method: req.method
  });
});

// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error("[Server Uncaught Error]", err);

  if (err.message && err.message.startsWith("CORS blocked")) {
    return res.status(403).json({ success: false, error: "Origin not allowed." });
  }

  const status = Number(err.statusCode) >= 400 && Number(err.statusCode) < 600 ? Number(err.statusCode) : 500;

  return res.status(status).json({
    success: false,
    error: status === 500 ? "Something went wrong on the server." : err.message || "Request failed."
  });
});

// ------------------------------------------------------------
// START & GRACEFUL SHUTDOWN
// ------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log("\n========================================");
  console.log("       KRUIZLY PRODUCTION BACKEND");
  console.log("========================================");
  console.log(`Environment : ${NODE_ENV}`);
  console.log(`Port        : ${PORT}`);
  console.log(`API URL     : http://localhost:${PORT}/api`);
  console.log("Database    : Hostinger MySQL Pool");
  console.log("Auth        : Firebase Authentication Only");
  console.log("========================================\n");
});

function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Closing HTTP server and MySQL connection pool...`);
  server.close(async () => {
    await db.closePool();
    console.log("[Server] Server stopped gracefully.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = app;

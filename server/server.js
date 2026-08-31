// server.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const mediaRoutes = require("./routes/media");
const paymentRoutes = require("./routes/payments");
const adminExportRoutes = require("./routes/adminExport");
const invoiceRoutes = require("./routes/invoice");

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
  })
);

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

const defaultOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://ayanchougle.github.io"
];

const envOrigins = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const configuredOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests such as curl/Postman.
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

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin"
    ],

    credentials: true,
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

// IMPORTANT:
// Frontend uses /api/invoices/...
// Therefore this must be plural: /api/invoices
app.use("/api/invoices", invoiceRoutes);

// ------------------------------------------------------------
// 404
// ------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: "API endpoint not found.",
    path: req.originalUrl,
    method: req.method,
  });
});

// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error("[server error]", err);

  if (
    err.message &&
    err.message.startsWith("CORS blocked")
  ) {
    return res.status(403).json({
      error: "Origin not allowed.",
    });
  }

  const status =
    Number(err.statusCode) >= 400 &&
    Number(err.statusCode) < 600
      ? Number(err.statusCode)
      : 500;

  return res.status(status).json({
    error:
      status === 500
        ? "Something went wrong on the server."
        : err.message || "Request failed.",
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
  console.log("Invoice API :");
  console.log(
    `  POST http://localhost:${PORT}/api/invoices/payment-approved/:bookingId`
  );
  console.log(
    `  GET  http://localhost:${PORT}/api/invoices/:invoiceId`
  );
  console.log(
    `  PUT  http://localhost:${PORT}/api/invoices/:invoiceId`
  );
  console.log(
    `  POST http://localhost:${PORT}/api/invoices/:invoiceId/send`
  );
  console.log(
    `  GET  http://localhost:${PORT}/api/invoices/:invoiceId/pdf`
  );
  console.log("");
  console.log("Allowed origins:");

  for (const origin of configuredOrigins) {
    console.log(`  - ${origin}`);
  }

  console.log("========================================");
  console.log("");
});

const express = require("express");
const XLSX = require("xlsx");
const admin = require("../firebaseAdmin");

const router = express.Router();

const db = admin.firestore();

// ------------------------------------------------------------
// Convert Firestore values into Excel-safe values
// ------------------------------------------------------------

function convertValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  // Firestore Timestamp
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  // Firestore DocumentReference
  if (
    value &&
    typeof value.path === "string" &&
    value.constructor &&
    value.constructor.name === "DocumentReference"
  ) {
    return value.path;
  }

  // Arrays
  if (Array.isArray(value)) {
    return value.map(convertValue).join(", ");
  }

  // Objects / maps
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

function flattenRecord(value, prefix = "", output = {}) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.toDate !== "function" &&
    !(typeof value.path === "string" && value.constructor?.name === "DocumentReference")
  ) {
    for (const [key, nestedValue] of Object.entries(value)) {
      flattenRecord(
        nestedValue,
        prefix ? `${prefix}.${key}` : key,
        output
      );
    }
    return output;
  }

  output[prefix] = Array.isArray(value)
    ? JSON.stringify(value.map(convertValue))
    : convertValue(value);
  return output;
}

// ------------------------------------------------------------
// Convert Firestore snapshot to rows
// ------------------------------------------------------------

function snapshotToRows(snapshot) {
  return snapshot.docs.map((doc) => {
    const data = doc.data();

    const row = {
      documentId: doc.id,
    };

    Object.assign(row, flattenRecord(data));

    return row;
  });
}

// ------------------------------------------------------------
// Create Excel worksheet
// ------------------------------------------------------------

function createWorksheet(rows) {
  if (!rows.length) {
    return XLSX.utils.aoa_to_sheet([
      ["No records found"],
    ]);
  }

  const columns = [
    ...new Set(rows.flatMap((row) => Object.keys(row))),
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: columns,
  });

  worksheet["!cols"] = columns.map((column) => {
    let width = column.length + 2;

    for (const row of rows) {
      const value = String(row[column] ?? "");

      width = Math.max(width, value.length + 2);
    }

    return {
      wch: Math.min(Math.max(width, 12), 45),
    };
  });

  worksheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(columns.length - 1)}${rows.length + 1}`,
  };

  return worksheet;
}

// ------------------------------------------------------------
// Verify Firebase ID token
// ------------------------------------------------------------

async function verifyAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const idToken = authHeader.substring(7).trim();

    if (!idToken) {
      return res.status(401).json({
        error: "Authentication token missing.",
      });
    }

    const decodedToken = await admin
      .auth()
      .verifyIdToken(idToken);

    req.user = decodedToken;

    // Check admin role from Firestore
    const userSnapshot = await db
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!userSnapshot.exists) {
      return res.status(403).json({
        error: "Admin account not found.",
      });
    }

    const userData = userSnapshot.data();

    if (userData.role !== "admin") {
      return res.status(403).json({
        error: "Admin access required.",
      });
    }

    next();
  } catch (error) {
    console.error(
      "[admin export] Authentication error:",
      error
    );

    return res.status(401).json({
      error: "Invalid or expired authentication token.",
    });
  }
}

// ------------------------------------------------------------
// GET /api/admin/export/excel
// ------------------------------------------------------------

router.get(
  "/export/excel",
  verifyAdmin,
  async (req, res) => {
    try {
      console.log(
        `[admin export] Export requested by ${req.user.uid}`
      );

      const collections = [
        {
          name: "users",
          sheet: "Users",
        },
        {
          name: "bookings",
          sheet: "Bookings",
        },
        {
          name: "partner_cars",
          sheet: "Partner Cars",
        },
        {
          name: "payments",
          sheet: "Payments",
        },
        {
          name: "contact_messages",
          sheet: "Contact Messages",
        },
        {
          name: "vehicles",
          sheet: "Vehicles",
        },
      ];

      const workbook = XLSX.utils.book_new();

      const summaryRows = [
        {
          Collection: "Export Information",
          Records: "",
          Information: `Generated ${new Date().toLocaleString(
            "en-IN"
          )}`,
        },
      ];

      for (const collection of collections) {
        console.log(
          `[admin export] Reading ${collection.name}...`
        );

        try {
          const snapshot = await db
            .collection(collection.name)
            .get();

          const rows = snapshotToRows(snapshot);

          console.log(
            `[admin export] ${collection.name}: ${rows.length}`
          );

          summaryRows.push({
            Collection: collection.name,
            Records: rows.length,
            Information: "Exported successfully",
          });

          XLSX.utils.book_append_sheet(
            workbook,
            createWorksheet(rows),
            collection.sheet
          );
        } catch (error) {
          console.error(
            `[admin export] Failed collection ${collection.name}:`,
            error
          );

          summaryRows.push({
            Collection: collection.name,
            Records: 0,
            Information: `Failed: ${error.message}`,
          });
        }
      }

      // --------------------------------------------------------
      // Summary sheet
      // --------------------------------------------------------

      const summarySheet =
        XLSX.utils.json_to_sheet(summaryRows);

      summarySheet["!cols"] = [
        { wch: 25 },
        { wch: 12 },
        { wch: 60 },
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Summary"
      );

      workbook.SheetNames = [
        "Summary",
        ...workbook.SheetNames.filter((name) => name !== "Summary"),
      ];

      // --------------------------------------------------------
      // Generate Excel buffer
      // --------------------------------------------------------

      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
        compression: true,
      });

      const date = new Date()
        .toISOString()
        .slice(0, 10);

      const filename =
        `CARRENTPE_Firebase_${date}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      res.setHeader(
        "Content-Length",
        excelBuffer.length
      );

      return res.status(200).send(excelBuffer);
    } catch (error) {
      console.error(
        "[admin export] Export failed:",
        error
      );

      return res.status(500).json({
        error: "Could not create Excel export.",
      });
    }
  }
);

module.exports = router;

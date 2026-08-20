const admin = require("./firebaseAdmin");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const db = admin.firestore();

const COLLECTIONS = [
  {
    name: "users",
    sheetName: "Users",
  },
  {
    name: "bookings",
    sheetName: "Bookings",
  },
  {
    name: "partner_cars",
    sheetName: "Partner Cars",
  },
];

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
    return value
      .map((item) => convertValue(item))
      .join(", ");
  }

  // Objects / maps
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

async function exportCollection(collectionName) {
  console.log(`Reading collection: ${collectionName}`);

  const snapshot = await db.collection(collectionName).get();

  console.log(
    `  Found ${snapshot.size} document(s)`
  );

  const rows = [];

  snapshot.forEach((doc) => {
    const data = doc.data();

    const row = {
      documentId: doc.id,
    };

    Object.entries(data).forEach(([key, value]) => {
      row[key] = convertValue(value);
    });

    rows.push(row);
  });

  return rows;
}

function createWorksheet(rows) {
  if (rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([
      ["No documents found"],
    ]);
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  const columns = Object.keys(rows[0]);

  worksheet["!cols"] = columns.map((column) => {
    let maxLength = column.length;

    for (const row of rows) {
      const value = String(
        row[column] ?? ""
      );

      if (value.length > maxLength) {
        maxLength = value.length;
      }
    }

    return {
      wch: Math.min(
        Math.max(maxLength + 2, 12),
        45
      ),
    };
  });

  return worksheet;
}

async function exportAll() {
  try {
    console.log("");
    console.log("========================================");
    console.log("       KRUIZLY FIRESTORE EXPORT");
    console.log("========================================");
    console.log("");

    const workbook = XLSX.utils.book_new();

    const results = {};

    for (const collection of COLLECTIONS) {
      const rows = await exportCollection(
        collection.name
      );

      results[collection.name] = rows;

      const worksheet = createWorksheet(rows);

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        collection.sheetName
      );
    }

    // Create exports directory
    const outputDir = path.join(
      __dirname,
      "exports"
    );

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {
        recursive: true,
      });
    }

    const date = new Date()
      .toISOString()
      .slice(0, 10);

    const outputFile = path.join(
      outputDir,
      `KRUIZLY-Export-${date}.xlsx`
    );

    XLSX.writeFile(
      workbook,
      outputFile
    );

    console.log("");
    console.log("========================================");
    console.log("       EXPORT COMPLETE");
    console.log("========================================");
    console.log(
      `Users       : ${results.users.length}`
    );
    console.log(
      `Bookings    : ${results.bookings.length}`
    );
    console.log(
      `Partner Cars: ${results.partner_cars.length}`
    );
    console.log("");
    console.log(`Excel file:`);
    console.log(outputFile);
    console.log("");
    console.log("Sheets:");
    console.log("  1. Users");
    console.log("  2. Bookings");
    console.log("  3. Partner Cars");
    console.log("========================================");
  } catch (error) {
    console.error("");
    console.error("========================================");
    console.error("       EXPORT FAILED");
    console.error("========================================");
    console.error(error);
    console.error("");
    process.exit(1);
  }
}

exportAll();
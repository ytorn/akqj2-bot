import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "eventbot.sqlite");
const db = new Database(dbPath);

console.log("🔄 Starting migration: Add regId column to chips_log table...");

try {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(chips_log)").all();
    const hasRegId = tableInfo.some(col => col.name === "regId" || col.name === "reg_id");

    if (hasRegId) {
        console.log("✅ Column regId already exists. Migration skipped.");
        db.close();
        process.exit(0);
    }

    // Check if there are existing rows
    const existingRows = db.prepare("SELECT COUNT(*) as count FROM chips_log").get();
    const hasData = existingRows.count > 0;

    if (hasData) {
        console.log(`⚠️  Found ${existingRows.count} existing rows in chips_log table.`);
        console.log("⚠️  Since regId is required, existing rows will need to be handled.");
        console.log("⚠️  Options:");
        console.log("   1. Delete existing chips_log rows (recommended if no important data)");
        console.log("   2. Set regId to NULL temporarily (requires code changes)");
        console.log("   3. Manually update existing rows with appropriate regId values");
        console.log("");
        console.log("⚠️  For now, adding column as nullable. You'll need to:");
        console.log("   1. Update existing rows with appropriate regId values");
        console.log("   2. Then make the column NOT NULL if needed");
        console.log("");

        // Add column as nullable first
        db.prepare(`
            ALTER TABLE chips_log 
            ADD COLUMN regId INTEGER
        `).run();

        console.log("✅ Column regId added as nullable.");
        console.log("⚠️  Please update existing rows with appropriate regId values.");
        console.log("⚠️  Example SQL: UPDATE chips_log SET regId = (SELECT id FROM registration_log WHERE ...) WHERE regId IS NULL");
    } else {
        // No existing data, can add as NOT NULL
        db.prepare(`
            ALTER TABLE chips_log 
            ADD COLUMN regId INTEGER NOT NULL
        `).run();

        console.log("✅ Column regId added as NOT NULL.");
    }

    console.log("✅ Migration completed successfully!");
    db.close();
    process.exit(0);
} catch (error) {
    console.error("❌ Migration failed:", error);
    db.close();
    process.exit(1);
}


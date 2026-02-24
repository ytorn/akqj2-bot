import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "eventbot.sqlite");
const db = new Database(dbPath);

console.log("🔄 Starting migration: Add dealer_tips column to events table...");

try {
    // List existing tables
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();

    console.log("📋 Existing tables:", tables.map(t => t.name).join(", "));

    // Try to find the events table (could be events, Events, etc.)
    const eventsTable = tables.find(t =>
        t.name.toLowerCase().includes("event")
    );

    if (!eventsTable) {
        console.log("⚠️  events table not found. Nothing to migrate.");
        db.close();
        process.exit(0);
    }

    const tableName = eventsTable.name;
    console.log(`📊 Using table: ${tableName}`);

    // Check if dealer_tips column already exists
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasDealerTips = tableInfo.some(col => col.name === "dealer_tips");

    if (hasDealerTips) {
        console.log("✅ Column dealer_tips already exists. Migration skipped.");
        db.close();
        process.exit(0);
    }

    // Add dealer_tips as nullable integer
    db.prepare(`
        ALTER TABLE ${tableName}
        ADD COLUMN dealer_tips INTEGER
    `).run();

    console.log("✅ Column dealer_tips added as nullable INTEGER.");
    console.log("✅ Migration completed successfully!");
    db.close();
    process.exit(0);
} catch (error) {
    console.error("❌ Migration failed:", error);
    db.close();
    process.exit(1);
}


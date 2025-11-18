import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "eventbot.sqlite");
const db = new Database(dbPath);

console.log("🔄 Starting migration: Add is_final column to chips_logs table...");

try {
    // First, check what tables exist
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    console.log("📋 Existing tables:", tables.map(t => t.name).join(", "));
    
    // Find the chips log table (could be chips_logs, chipsLogs, etc.)
    const chipsLogTable = tables.find(t => 
        t.name.toLowerCase().includes('chips') && t.name.toLowerCase().includes('log')
    );
    
    if (!chipsLogTable) {
        console.log("⚠️  chips_logs table not found. Please run the regId migration first.");
        db.close();
        process.exit(1);
    }
    
    const tableName = chipsLogTable.name;
    console.log(`📊 Using table: ${tableName}`);
    
    // Check if column already exists
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasIsFinal = tableInfo.some(col => col.name === "is_final" || col.name === "isFinal");

    if (hasIsFinal) {
        console.log("✅ Column is_final already exists. Migration skipped.");
        db.close();
        process.exit(0);
    }

    // Add column with default value false
    db.prepare(`
        ALTER TABLE ${tableName} 
        ADD COLUMN is_final BOOLEAN DEFAULT 0
    `).run();

    // Update existing rows to have is_final = false
    db.prepare(`
        UPDATE ${tableName} 
        SET is_final = 0 
        WHERE is_final IS NULL
    `).run();

    console.log("✅ Column is_final added with default value false.");
    console.log("✅ Migration completed successfully!");
    db.close();
    process.exit(0);
} catch (error) {
    console.error("❌ Migration failed:", error);
    db.close();
    process.exit(1);
}


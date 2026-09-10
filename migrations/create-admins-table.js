import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HARDCODED_ADMIN_ID = 323046603; // JP
const LEGACY_ADMIN_IDS = [
    561292215, // AH
    564354756, // KT
];

const dbPath = path.join(__dirname, "..", "eventbot.sqlite");
const db = new Database(dbPath);

console.log("🔄 Starting migration: Create admins table...");

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id BIGINT NOT NULL UNIQUE,
            createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const insert = db.prepare(`
        INSERT OR IGNORE INTO admins (telegram_id, createdAt, updatedAt)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    for (const telegramId of LEGACY_ADMIN_IDS) {
        insert.run(telegramId);
    }

    db.prepare(`DELETE FROM admins WHERE telegram_id = ?`).run(HARDCODED_ADMIN_ID);

    const rows = db.prepare(`SELECT id, telegram_id FROM admins ORDER BY id ASC`).all();
    console.log("✅ admins table ready. Current rows:", rows);
    console.log("✅ Migration completed successfully!");
    db.close();
    process.exit(0);
} catch (error) {
    console.error("❌ Migration failed:", error);
    db.close();
    process.exit(1);
}

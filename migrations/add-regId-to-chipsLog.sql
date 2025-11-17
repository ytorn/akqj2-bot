-- Migration: Add regId column to chips_log table
-- Run this script on your SQLite database

-- Check if column exists first (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
-- If the column already exists, this will fail - that's okay, it means it's already done

-- Option 1: If you have NO existing data in chips_log table, use this:
-- ALTER TABLE chips_log ADD COLUMN regId INTEGER NOT NULL;

-- Option 2: If you HAVE existing data, use this (adds as nullable first):
ALTER TABLE chips_log ADD COLUMN regId INTEGER;

-- After adding the column, you'll need to:
-- 1. Update existing rows with appropriate regId values
-- 2. If you want it to be NOT NULL, you'll need to:
--    - Update all NULL values first
--    - Then you can't change it to NOT NULL in SQLite without recreating the table
--    - Or just ensure your code handles it properly

-- Example update for existing rows (adjust based on your data):
-- UPDATE chips_log 
-- SET regId = (
--     SELECT id FROM registration_log 
--     WHERE registration_log.user_id = chips_log.user_id 
--     AND registration_log.event_id = chips_log.event_id 
--     LIMIT 1
-- )
-- WHERE regId IS NULL;


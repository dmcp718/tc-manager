-- Direct Links Schema Addition
-- Add direct link storage to files table

ALTER TABLE files ADD COLUMN IF NOT EXISTS direct_link TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS direct_link_created_at TIMESTAMP;

-- Index for direct link lookups
CREATE INDEX IF NOT EXISTS idx_files_direct_link ON files USING btree(direct_link) WHERE direct_link IS NOT NULL;
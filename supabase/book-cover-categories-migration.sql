-- Add book cover data and optional catalog categories.
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';

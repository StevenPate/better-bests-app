-- Create weekly_scores table for individual weekly performance records
CREATE TABLE IF NOT EXISTS weekly_scores (
  id bigserial PRIMARY KEY,
  isbn text NOT NULL,
  region text NOT NULL,
  week_date date NOT NULL,
  rank integer NOT NULL,
  category text,
  list_size integer NOT NULL,
  points numeric(10, 4),
  created_at timestamptz DEFAULT now(),

  CONSTRAINT weekly_scores_unique UNIQUE(isbn, region, week_date, category)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_weekly_scores_isbn ON weekly_scores(isbn);
CREATE INDEX IF NOT EXISTS idx_weekly_scores_week ON weekly_scores(week_date);
CREATE INDEX IF NOT EXISTS idx_weekly_scores_region ON weekly_scores(region);

-- RLS policies (same pattern as regional_bestsellers)
ALTER TABLE weekly_scores ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "weekly_scores_select_policy" ON weekly_scores
  FOR SELECT USING (true);

-- Allow authenticated inserts
CREATE POLICY "weekly_scores_insert_policy" ON weekly_scores
  FOR INSERT WITH CHECK (true);

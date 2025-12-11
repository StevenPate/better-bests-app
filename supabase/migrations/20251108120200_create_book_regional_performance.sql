-- Create book_regional_performance table for regional breakdowns
CREATE TABLE IF NOT EXISTS book_regional_performance (
  isbn text NOT NULL,
  region text NOT NULL,
  year integer NOT NULL,
  regional_score numeric(10, 4),
  regional_strength_index numeric(8, 6),
  weeks_on_chart integer,
  best_rank integer,
  avg_rank numeric(6, 2),
  avg_score_per_week numeric(10, 4),

  PRIMARY KEY (isbn, region, year)
);

-- Indexes for regional rankings
CREATE INDEX IF NOT EXISTS idx_regional_score ON book_regional_performance(regional_score DESC);
CREATE INDEX IF NOT EXISTS idx_regional_rsi ON book_regional_performance(regional_strength_index DESC);
CREATE INDEX IF NOT EXISTS idx_regional_avg_score ON book_regional_performance(avg_score_per_week DESC);
CREATE INDEX IF NOT EXISTS idx_regional_year ON book_regional_performance(year);

-- RLS policies
ALTER TABLE book_regional_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regional_select_policy" ON book_regional_performance
  FOR SELECT USING (true);

CREATE POLICY "regional_insert_policy" ON book_regional_performance
  FOR INSERT WITH CHECK (true);

CREATE POLICY "regional_update_policy" ON book_regional_performance
  FOR UPDATE USING (true);

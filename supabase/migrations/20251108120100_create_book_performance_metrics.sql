-- Create book_performance_metrics table for aggregated metrics
CREATE TABLE IF NOT EXISTS book_performance_metrics (
  isbn text NOT NULL,
  year integer NOT NULL,
  total_score numeric(12, 4),
  weeks_on_chart integer,
  regions_appeared integer,
  max_weekly_score numeric(10, 4),
  avg_weekly_score numeric(10, 4),
  avg_score_per_week numeric(10, 4),
  rsi_variance numeric(10, 6),
  updated_at timestamptz DEFAULT now(),

  PRIMARY KEY (isbn, year)
);

-- Indexes for ranking queries (year included for efficient filtering)
CREATE INDEX IF NOT EXISTS idx_metrics_year_total_score ON book_performance_metrics(year, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_year_rsi_variance ON book_performance_metrics(year, rsi_variance);
CREATE INDEX IF NOT EXISTS idx_metrics_year_avg_score ON book_performance_metrics(year, avg_score_per_week DESC);

-- RLS policies
ALTER TABLE book_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metrics_select_policy" ON book_performance_metrics
  FOR SELECT USING (true);

CREATE POLICY "metrics_insert_policy" ON book_performance_metrics
  FOR INSERT WITH CHECK (true);

CREATE POLICY "metrics_update_policy" ON book_performance_metrics
  FOR UPDATE USING (true);

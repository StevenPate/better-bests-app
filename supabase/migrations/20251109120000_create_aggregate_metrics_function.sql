/**
 * PostgreSQL Function: aggregate_book_metrics
 *
 * Aggregates weekly_scores into performance metrics using SQL GROUP BY.
 * This approach is far more efficient than pulling all rows into memory
 * in the Edge Function and processing with JavaScript.
 *
 * Returns: JSON object with book metrics and regional performance
 */

CREATE OR REPLACE FUNCTION aggregate_book_metrics(target_year integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  start_date date;
  end_date date;
BEGIN
  start_date := (target_year || '-01-01')::date;
  end_date := ((target_year + 1) || '-01-01')::date;

  -- Calculate and upsert book performance metrics
  INSERT INTO book_performance_metrics (
    isbn,
    year,
    total_score,
    weeks_on_chart,
    regions_appeared,
    max_weekly_score,
    avg_weekly_score,
    avg_score_per_week,
    rsi_variance,
    updated_at
  )
  SELECT
    isbn_metrics.isbn,
    target_year,
    isbn_metrics.total_score,
    isbn_metrics.weeks_on_chart,
    isbn_metrics.regions_appeared,
    isbn_metrics.max_weekly_score,
    isbn_metrics.avg_weekly_score,
    isbn_metrics.avg_score_per_week,
    COALESCE(rsi_var.rsi_variance, 0),
    NOW()
  FROM (
    -- Basic ISBN-level aggregates
    SELECT
      isbn,
      SUM(points)::numeric(12,4) as total_score,
      COUNT(*)::integer as weeks_on_chart,
      COUNT(DISTINCT region)::integer as regions_appeared,
      MAX(points)::numeric(10,4) as max_weekly_score,
      AVG(points)::numeric(10,4) as avg_weekly_score,
      (SUM(points) / COUNT(*))::numeric(10,4) as avg_score_per_week
    FROM weekly_scores
    WHERE week_date >= start_date AND week_date < end_date
    GROUP BY isbn
  ) isbn_metrics
  LEFT JOIN (
    -- RSI variance calculation
    SELECT
      isbn,
      VARIANCE(rsi)::numeric(10,6) as rsi_variance
    FROM (
      SELECT
        regional.isbn,
        (regional.regional_score / NULLIF(totals.total_score, 0)) as rsi
      FROM (
        SELECT
          isbn,
          region,
          SUM(points) as regional_score
        FROM weekly_scores
        WHERE week_date >= start_date AND week_date < end_date
        GROUP BY isbn, region
      ) regional
      JOIN (
        SELECT
          isbn,
          SUM(points) as total_score
        FROM weekly_scores
        WHERE week_date >= start_date AND week_date < end_date
        GROUP BY isbn
      ) totals ON regional.isbn = totals.isbn
    ) rsi_values
    GROUP BY isbn
  ) rsi_var ON isbn_metrics.isbn = rsi_var.isbn
  ON CONFLICT (isbn, year)
  DO UPDATE SET
    total_score = EXCLUDED.total_score,
    weeks_on_chart = EXCLUDED.weeks_on_chart,
    regions_appeared = EXCLUDED.regions_appeared,
    max_weekly_score = EXCLUDED.max_weekly_score,
    avg_weekly_score = EXCLUDED.avg_weekly_score,
    avg_score_per_week = EXCLUDED.avg_score_per_week,
    rsi_variance = EXCLUDED.rsi_variance,
    updated_at = EXCLUDED.updated_at;

  -- Calculate and upsert regional performance
  INSERT INTO book_regional_performance (
    isbn,
    region,
    year,
    regional_score,
    regional_strength_index,
    weeks_on_chart,
    best_rank,
    avg_rank,
    avg_score_per_week
  )
  SELECT
    regional.isbn,
    regional.region,
    target_year,
    regional.regional_score,
    (regional.regional_score / NULLIF(totals.total_score, 0))::numeric(10,6),
    regional.weeks_on_chart,
    regional.best_rank,
    regional.avg_rank::numeric(10,2),
    (regional.regional_score / NULLIF(regional.weeks_on_chart, 0))::numeric(10,4)
  FROM (
    SELECT
      isbn,
      region,
      SUM(points)::numeric(12,4) as regional_score,
      COUNT(*)::integer as weeks_on_chart,
      MIN(rank)::integer as best_rank,
      AVG(rank) as avg_rank
    FROM weekly_scores
    WHERE week_date >= start_date AND week_date < end_date
    GROUP BY isbn, region
  ) regional
  JOIN (
    SELECT
      isbn,
      SUM(points) as total_score
    FROM weekly_scores
    WHERE week_date >= start_date AND week_date < end_date
    GROUP BY isbn
  ) totals ON regional.isbn = totals.isbn
  ON CONFLICT (isbn, region, year)
  DO UPDATE SET
    regional_score = EXCLUDED.regional_score,
    regional_strength_index = EXCLUDED.regional_strength_index,
    weeks_on_chart = EXCLUDED.weeks_on_chart,
    best_rank = EXCLUDED.best_rank,
    avg_rank = EXCLUDED.avg_rank,
    avg_score_per_week = EXCLUDED.avg_score_per_week;

  -- Return summary
  SELECT json_build_object(
    'books_processed', (SELECT COUNT(DISTINCT isbn) FROM weekly_scores WHERE week_date >= start_date AND week_date < end_date),
    'metrics_updated', (SELECT COUNT(*) FROM book_performance_metrics WHERE year = target_year),
    'regional_updated', (SELECT COUNT(*) FROM book_regional_performance WHERE year = target_year)
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION aggregate_book_metrics(integer) TO authenticated, service_role;

COMMENT ON FUNCTION aggregate_book_metrics IS 'Aggregates weekly_scores into performance metrics tables using SQL. Called by update-book-metrics Edge Function.';

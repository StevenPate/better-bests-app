-- PostgreSQL function for calculating weekly scores
CREATE OR REPLACE FUNCTION calculate_weekly_score(
  rank integer,
  list_size integer
) RETURNS numeric AS $$
BEGIN
  -- Handle edge cases
  IF rank < 1 OR list_size < 1 THEN
    RETURN 0;
  END IF;

  -- Logarithmic decay formula: 100 * (1 - log(rank) / log(list_size + 1))
  RETURN 100 * (1 - log(rank) / log(list_size + 1));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

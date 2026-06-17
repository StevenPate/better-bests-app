-- Shift existing `drive_urls_YYYY-MM-DD` cache keys forward by 7 days.
--
-- Background: scrape-regional-urls had an off-by-one bug in
-- `wednesdayFromWeekEndDate` — it computed the Wednesday *before* the
-- "week ended" Sunday instead of the Wednesday *after* (publication day).
-- As a result every cached entry is keyed one week earlier than the URLs
-- it actually contains.
--
-- This migration corrects existing rows so that frontend lookups (which
-- compute the publication Wednesday correctly) find the right URLs.
-- Idempotent: safe if no matching rows exist.

DO $$
DECLARE
  r RECORD;
  old_date TEXT;
  new_date TEXT;
  new_key TEXT;
BEGIN
  FOR r IN
    SELECT cache_key
    FROM fetch_cache
    WHERE cache_key ~ '^drive_urls_\d{4}-\d{2}-\d{2}$'
    ORDER BY cache_key DESC
  LOOP
    old_date := substring(r.cache_key FROM 12);
    new_date := to_char(old_date::date + INTERVAL '7 days', 'YYYY-MM-DD');
    new_key := 'drive_urls_' || new_date;

    -- Skip if a (correctly-keyed) row already exists at the target.
    IF EXISTS (SELECT 1 FROM fetch_cache WHERE cache_key = new_key) THEN
      RAISE NOTICE 'Skipping %: % already exists', r.cache_key, new_key;
      CONTINUE;
    END IF;

    UPDATE fetch_cache
    SET cache_key = new_key
    WHERE cache_key = r.cache_key;

    RAISE NOTICE 'Renamed % -> %', r.cache_key, new_key;
  END LOOP;
END $$;

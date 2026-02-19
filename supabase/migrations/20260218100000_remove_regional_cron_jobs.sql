-- Remove pg_cron jobs for regional bestseller population.
-- This pipeline has been moved to Trigger.dev for reliability and observability.
-- See trigger/populate-regional-bestsellers.ts

SELECT cron.unschedule('populate-regional-bestsellers-weekly');
SELECT cron.unschedule('populate-regional-bestsellers-retry');

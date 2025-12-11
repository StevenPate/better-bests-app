/**
 * Fix NULL Category Duplicates
 *
 * Problem: PostgreSQL treats NULL as distinct in UNIQUE constraints,
 * so rows with NULL category can be inserted multiple times even with
 * the UNIQUE(isbn, region, week_date, category) constraint.
 *
 * Solution:
 * 1. Update any existing NULL categories to 'General'
 * 2. Add NOT NULL constraint to prevent future NULLs
 * 3. Add CHECK constraint as additional guard
 *
 * This ensures weekly_scores upserts work correctly and prevents
 * double-counting in performance metrics aggregation.
 */

-- Step 1: Update any existing NULL categories to 'General'
UPDATE weekly_scores
SET category = 'General'
WHERE category IS NULL;

-- Step 2: Add NOT NULL constraint
ALTER TABLE weekly_scores
ALTER COLUMN category SET NOT NULL;

-- Step 3: Add CHECK constraint to ensure non-empty string
ALTER TABLE weekly_scores
ADD CONSTRAINT category_not_empty CHECK (length(trim(category)) > 0);

-- Step 4: Add default value for safety
ALTER TABLE weekly_scores
ALTER COLUMN category SET DEFAULT 'General';

-- Verify the fix
COMMENT ON COLUMN weekly_scores.category IS 'Book category - defaults to General, cannot be NULL or empty';

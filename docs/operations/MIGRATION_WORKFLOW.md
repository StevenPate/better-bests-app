# Database Migration Promotion Workflow

## Overview

All database migrations MUST be tested in staging before production deployment.

**Core Principle:** Staging-first, production-last. Never test migrations directly in production.

## Workflow Steps

### 1. Create Migration

```bash
# Link to staging
supabase link --project-ref gyqbhphtgjlqczxhsoki

# Generate migration file
supabase migration new add_feature_xyz
```

This creates: `supabase/migrations/YYYYMMDDHHMMSS_add_feature_xyz.sql`

Edit the file with your SQL changes:

```sql
-- Migration: Add feature XYZ
-- Date: YYYY-MM-DD
-- Author: Your Name

-- Add new column
ALTER TABLE my_table ADD COLUMN new_column TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS idx_my_table_new_column
  ON my_table(new_column);

-- Add RLS policy
CREATE POLICY new_policy ON my_table
  FOR SELECT
  USING (true);
```

### 2. Test in Staging

```bash
# Ensure linked to staging
grep "project_id" supabase/config.toml
# Should show: gyqbhphtgjlqczxhsoki

# Apply migration to staging
supabase db push

# Verify migration applied
supabase migration list
```

**Verification checklist:**

- [ ] Tables created/modified as expected
- [ ] Columns have correct data types and constraints
- [ ] RLS policies functioning correctly
- [ ] Indexes created (check with `\d table_name` in psql)
- [ ] No data corruption (spot-check existing data)
- [ ] Edge functions still work
- [ ] Foreign key constraints valid
- [ ] Triggers firing correctly

**Staging Database Verification:**

Navigate to Supabase Dashboard → Table Editor:
- Check table structure
- Verify row counts unchanged (unless migration modifies data)
- Test CRUD operations manually

### 3. Test Frontend with Staging

```bash
# Use staging backend
cp .env.staging .env

# Restart dev server (environment variables loaded at build time)
npm run dev
```

**Frontend checklist:**

- [ ] All pages load without errors
- [ ] CRUD operations work correctly
- [ ] No console errors in browser DevTools
- [ ] Performance acceptable (no slow queries)
- [ ] Filters and search work
- [ ] Export features work (PDF/CSV)
- [ ] Authentication still works

**Test scenarios:**
- Happy path (normal user flow)
- Edge cases (empty data, long strings, special characters)
- Error cases (invalid input, missing data)

### 4. Code Review

Create a Pull Request with:

**Required files:**
- Migration SQL file (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`)
- Updated documentation (if schema changed significantly)

**PR Description should include:**
- Purpose of migration (what problem does it solve?)
- Test results from staging
  - Migration applied successfully? ✅
  - Frontend tested? ✅
  - Performance impact? (none/minimal/measured)
- Screenshots if UI affected
- Rollback plan (how to undo if needed)

**Review checklist for reviewers:**
- [ ] Migration follows naming conventions
- [ ] SQL is safe (no DROP without backup)
- [ ] Includes rollback procedure
- [ ] Tested in staging (evidence provided)
- [ ] No hardcoded production data
- [ ] Comments explain complex logic

### 5. Promote to Production

**Prerequisites:**
- ✅ PR approved by reviewer
- ✅ Staging tests passed
- ✅ Team notified of deployment window
- ✅ Off-peak hours scheduled (if possible)

**Deployment:**

```bash
# Link to production
supabase link --project-ref auwllsalgwiwdzohpmum

# Verify connected to production
grep "project_id" supabase/config.toml
# Should show: auwllsalgwiwdzohpmum

# Dry run - review SQL one last time
cat supabase/migrations/YYYYMMDDHHMMSS_add_feature_xyz.sql

# Apply migration
supabase db push

# Verify application
supabase migration list
# Should show new migration in both Local and Remote columns
```

### 6. Post-Deploy Verification

**Immediate checks (first 5 minutes):**

```bash
# Use production backend
cp .env.production .env
npm run dev
```

- [ ] App loads without errors
- [ ] Home page renders correctly
- [ ] Critical features work (bestseller lists, filters)
- [ ] No console errors

**Extended monitoring (first 30 minutes):**

- [ ] Check Supabase logs for errors:
  - Dashboard → Logs → Database
  - Look for ERROR or FATAL messages
- [ ] Monitor query performance:
  - Dashboard → Database → Query Performance
  - Check for slow queries (>1000ms)
- [ ] Spot-check data integrity:
  - Sample a few records
  - Verify relationships intact

**Production checklist:**

- [ ] Data displays correctly
- [ ] No performance degradation
- [ ] CRUD operations work
- [ ] Export features work
- [ ] User authentication works
- [ ] No user-reported issues

## Rollback Procedure

If migration causes issues, act quickly.

### Immediate Rollback

**Step 1: Assess severity**

- Minor (cosmetic issues): Consider forward fix
- Major (data corruption, app broken): Rollback immediately

**Step 2: Create rollback migration**

```bash
# Link to production
supabase link --project-ref auwllsalgwiwdzohpmum

# Create reverse migration
supabase migration new rollback_feature_xyz
```

**Step 3: Write reverse SQL**

Edit `supabase/migrations/YYYYMMDDHHMMSS_rollback_feature_xyz.sql`:

```sql
-- Rollback: Undo add_feature_xyz
-- Reason: [Brief explanation of why rolling back]

-- Example: Drop added column
ALTER TABLE my_table DROP COLUMN IF EXISTS new_column;

-- Example: Drop added index
DROP INDEX IF EXISTS idx_my_table_new_column;

-- Example: Restore old RLS policy
DROP POLICY IF EXISTS new_policy ON my_table;
CREATE POLICY old_policy ON my_table FOR SELECT USING (true);
```

**Step 4: Apply rollback**

```bash
# Apply rollback migration
supabase db push

# Verify rollback
supabase migration list
```

**Step 5: Verify app works**

```bash
npm run dev
# Check that app is functional again
```

### Long-term Fix

After rolling back:

1. **Identify root cause**
   - What went wrong?
   - Why didn't staging tests catch it?
   - What assumptions were incorrect?

2. **Fix migration in staging**
   - Create new migration with fix
   - Test thoroughly
   - Add test cases for what broke

3. **Test edge cases**
   - Try to break it again
   - Test with production-like data volume

4. **Promote fixed version**
   - Follow promotion workflow above
   - Double-check this time

5. **Document incident**
   - Add to incident log
   - Update runbook with lessons learned

## Emergency Procedures

### Production Database Issues

**When things go very wrong:**

1. **Stop the bleeding**
   - Disable feature flag if available:
     ```bash
     # Set VITE_ENABLE_MULTI_REGION=false in production .env
     ```
   - Revert code deployment if needed

2. **Notify team**
   - Post in #incidents channel (or equivalent)
   - Tag on-call engineer
   - Provide:
     - What's broken
     - Impact (how many users)
     - Actions taken so far

3. **Assess impact**
   - How many users affected?
   - Is data corrupted?
   - Can we rollback safely?

4. **Decide action**
   - **Rollback**: If data corruption or app completely broken
   - **Forward fix**: If minor issue with known fix
   - **Hotfix**: For critical security issues

5. **Execute**
   - Follow rollback procedure above (if rolling back)
   - Deploy hotfix via emergency PR (if fixing forward)

6. **Monitor**
   - Watch metrics for 1 hour after fix
   - Check error rates
   - Verify user reports decreasing

7. **Document**
   - Write incident report within 24 hours
   - Include:
     - Timeline of events
     - Root cause
     - Actions taken
     - Lessons learned
     - Preventive measures

### Data Loss Prevention

**Before destructive migrations:**

```bash
# Link to production
supabase link --project-ref auwllsalgwiwdzohpmum

# Backup production database
supabase db dump --data-only > backup-$(date +%Y%m%d-%H%M%S).sql

# Store backup safely (outside project directory)
mkdir -p ~/backups/better-bestsellers
mv backup-*.sql ~/backups/better-bestsellers/

# Verify backup
ls -lh ~/backups/better-bestsellers/
```

**Backup retention:**
- Keep daily backups for 7 days
- Keep weekly backups for 1 month
- Keep monthly backups for 1 year

**Supabase automatic backups:**
- Daily backups enabled by default
- Accessible in Dashboard → Database → Backups
- Restore from backup if needed

## CI/CD Integration (Optional)

### GitHub Actions Workflow

Create `.github/workflows/migrations.yml`:

```yaml
name: Database Migrations

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'

jobs:
  test-migration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Link to staging
        run: supabase link --project-ref ${{ secrets.STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Apply migration to staging
        run: supabase db push

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
        env:
          VITE_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}
```

### Required GitHub Secrets

Add to repository Settings → Secrets and variables → Actions:

- `STAGING_PROJECT_REF`: `gyqbhphtgjlqczxhsoki`
- `SUPABASE_ACCESS_TOKEN`: Personal access token from Supabase Dashboard
- `STAGING_SUPABASE_URL`: `https://gyqbhphtgjlqczxhsoki.supabase.co`
- `STAGING_SUPABASE_ANON_KEY`: Staging anon key

## Best Practices

### DO

- ✅ **Test in staging first** (always, no exceptions)
- ✅ **Use transactions** for multi-step migrations
  ```sql
  BEGIN;
  -- Multiple related changes
  ALTER TABLE table1 ADD COLUMN col1 TEXT;
  ALTER TABLE table2 ADD COLUMN col2 TEXT;
  COMMIT;
  ```
- ✅ **Add comments** explaining complex SQL
- ✅ **Version control** all migrations (commit to git)
- ✅ **Communicate** before production deploys (team notification)
- ✅ **Include `IF EXISTS`/`IF NOT EXISTS`** for idempotency
- ✅ **Backup before destructive changes**
- ✅ **Monitor after deployment** (first 30 minutes critical)

### DON'T

- ❌ **Test migrations directly in production** (use staging!)
- ❌ **Skip staging verification** (even for "trivial" changes)
- ❌ **Deploy during peak hours** (without good reason/approval)
- ❌ **Modify old migrations** (create new ones instead)
- ❌ **Delete data without backups** (always backup first)
- ❌ **Rush deployments** (take time to verify)
- ❌ **Ignore warnings** (SQL warnings often indicate problems)
- ❌ **Deploy without rollback plan** (know how to undo)

## Migration Checklist Template

Copy this checklist for each migration:

```markdown
## Migration: [Name]

**Created by:** [Your Name]
**Date:** [YYYY-MM-DD]
**Purpose:** [Brief description]

### Pre-Deployment
- [ ] Migration file created
- [ ] SQL reviewed for safety
- [ ] Applied to staging database
- [ ] Verified in staging database
- [ ] Frontend tested with staging
- [ ] Performance tested
- [ ] Edge cases tested
- [ ] Rollback plan documented
- [ ] PR created and approved
- [ ] Team notified of deployment

### Deployment
- [ ] Linked to production
- [ ] Reviewed SQL one last time
- [ ] Applied migration
- [ ] Verified in migration list

### Post-Deployment
- [ ] App loads correctly
- [ ] Critical features work
- [ ] No console errors
- [ ] Logs checked (no errors)
- [ ] Performance acceptable
- [ ] Team notified of success

### Rollback (if needed)
- [ ] Rollback migration created
- [ ] Applied to production
- [ ] App verified working
- [ ] Incident documented
```

## Related Documentation

- [Supabase Migrations Guide](supabase-migrations.md) - Technical migration details
- [Environment Setup](../ENVIRONMENT_SETUP.md) - Environment configuration
- [Staging Data Maintenance](STAGING_DATA_MAINTENANCE.md) - Test data management
- [Production Data Isolation Plan](../plans/2025-11-03-production-data-isolation.md) - Overall strategy

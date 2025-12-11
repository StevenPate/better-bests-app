# Supabase Migrations Guide

## Overview

This guide explains how to manage database schema changes across production and staging environments using Supabase's migration system.

**Philosophy:** All schema changes are version-controlled SQL files that can be applied repeatably across environments.

## Migration Workflow

### 1. Check Current Migration Status

View which migrations have been applied to the current environment:

```bash
supabase migration list
```

Output shows:
- **Local**: Migration files in `supabase/migrations/`
- **Remote**: Migrations applied to the linked database
- **Time**: Migration timestamp (determines execution order)

### 2. Switching Environments

**Link to Production:**
```bash
supabase link --project-ref auwllsalgwiwdzohpmum
```

**Link to Staging:**
```bash
supabase link --project-ref gyqbhphtgjlqczxhsoki
```

**Verify current link:**
```bash
grep "project_id" supabase/config.toml
```

### 3. Apply Migrations to an Environment

Apply all pending migrations to the currently linked environment:

```bash
supabase db push
```

The CLI will:
1. Show list of pending migrations
2. Prompt for confirmation
3. Apply migrations in timestamp order
4. Track applied migrations in `supabase_migrations.schema_migrations` table

### 4. Create New Migrations

**Option A: Generate from production schema changes**

If production has manual schema changes that aren't in migration files:

```bash
# Link to production
supabase link --project-ref auwllsalgwiwdzohpmum

# Generate migration from schema diff
supabase db diff --schema public --schema auth --file schema_sync_YYYYMMDD
```

**Option B: Create migration manually**

```bash
# Create new migration file with timestamp
supabase migration new add_new_feature

# Edit the generated file in supabase/migrations/
# Add your SQL DDL statements
```

## Schema Synchronization: Production → Staging

### Use Case
Keep staging database in sync with production schema after major changes.

### Process

**Step 1: Verify production state**
```bash
# Link to production
supabase link --project-ref auwllsalgwiwdzohpmum

# Check applied migrations
supabase migration list
```

**Step 2: Generate diff if needed**

If production has schema changes not in migration files:

```bash
# Still linked to production
supabase db diff --schema public --schema auth --file production_sync

# Review the generated migration file
cat supabase/migrations/[timestamp]_production_sync.sql

# Commit to git if changes look correct
git add supabase/migrations/
git commit -m "chore: sync production schema changes to migrations"
```

**Step 3: Apply to staging**
```bash
# Link to staging
supabase link --project-ref gyqbhphtgjlqczxhsoki

# Check what's pending
supabase migration list

# Apply all pending migrations
supabase db push

# Verify sync
supabase migration list
# Local and Remote columns should match
```

### Frequency Recommendations

**Synchronize staging when:**
- After major production migrations (new features, schema changes)
- Before testing multi-region features
- When schema drift is detected
- Monthly maintenance check

## Migration Best Practices

### 1. Always Use Migrations for Schema Changes

❌ **Don't:**
- Make schema changes directly in Supabase Dashboard
- Use `db dump` and `db push` for schema sync
- Manually edit production database

✅ **Do:**
- Create migration files for all schema changes
- Test migrations in staging before production
- Commit migration files to git
- Apply migrations using `supabase db push`

### 2. Migration File Naming

Migrations are timestamped for execution order:
```
20251021120000_add_list_date_to_switches.sql
└─ Timestamp   └─ Descriptive name
```

Use descriptive names:
- ✅ `add_audience_column.sql`
- ✅ `create_regional_lists_table.sql`
- ✅ `update_rls_policies_for_multi_region.sql`
- ❌ `migration.sql`
- ❌ `fix.sql`

### 3. Migration Content Guidelines

**Include in migrations:**
- Table creation (`CREATE TABLE`)
- Column additions/modifications (`ALTER TABLE`)
- Index creation (`CREATE INDEX`)
- RLS policy changes (`CREATE POLICY`, `DROP POLICY`)
- Function definitions (`CREATE OR REPLACE FUNCTION`)
- Triggers (`CREATE TRIGGER`)

**Add helpful comments:**
```sql
-- Migration: Add support for multi-region book tracking
-- Date: 2025-11-03
-- Author: Better-bests-app

-- Create regional_lists table
CREATE TABLE IF NOT EXISTS public.regional_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL,
  -- ... rest of schema
);

-- Add index for region lookups
CREATE INDEX IF NOT EXISTS idx_regional_lists_region
  ON public.regional_lists(region);
```

### 4. Testing Migrations

**Before applying to production:**

1. **Test in staging:**
   ```bash
   # Link to staging
   supabase link --project-ref gyqbhphtgjlqczxhsoki

   # Apply migration
   supabase db push

   # Verify schema
   supabase db list
   ```

2. **Run application tests:**
   ```bash
   # Update .env to point to staging
   cp .env.staging .env

   # Run tests
   npm test

   # Manual testing in browser
   npm run dev
   ```

3. **Verify RLS policies:**
   ```bash
   # Check policies were applied correctly
   supabase db list --schema public
   ```

## Rollback Procedures

### Rolling Back a Migration

Migrations don't have built-in rollback. To undo a migration:

**Option 1: Create a reverse migration**
```bash
# Create new migration with reverse changes
supabase migration new rollback_feature_name

# Edit file to undo the previous migration
# Example: DROP TABLE instead of CREATE TABLE
```

**Option 2: Restore from backup (emergency only)**
```bash
# In Supabase Dashboard:
# Database → Backups → Restore to point in time
```

### Preventing Migration Issues

**Before running migrations:**
- ✅ Review SQL in migration file
- ✅ Test in staging first
- ✅ Backup production database
- ✅ Run during low-traffic periods
- ✅ Have rollback plan ready

## Troubleshooting

### "relation already exists" warnings

**Cause:** Migration tries to create object that exists
**Fix:** Add `IF NOT EXISTS` clauses:

```sql
CREATE TABLE IF NOT EXISTS public.my_table (...);
CREATE INDEX IF NOT EXISTS idx_my_index ON public.my_table(column);
```

### Migrations out of sync

**Symptom:** Local shows migrations that Remote doesn't
**Diagnosis:**
```bash
supabase migration list
# Check which migrations show in Local but not Remote
```

**Fix:**
```bash
# Apply pending migrations
supabase db push
```

### Wrong environment linked

**Symptom:** Accidentally linked to production instead of staging
**Fix:**
```bash
# Immediately relink to staging
supabase link --project-ref gyqbhphtgjlqczxhsoki

# Verify
grep "project_id" supabase/config.toml
```

### Migration fails partway through

**Symptom:** Error during `supabase db push`
**Fix:**
1. Check error message for SQL syntax issues
2. Fix migration file
3. Re-run `supabase db push`
4. Supabase tracks which migrations succeeded, won't re-apply them

## Reference: Current Migrations

As of 2025-11-03, we have 15 migrations applied to both production and staging:

| Migration | Description |
|-----------|-------------|
| `20250829062457` | Initial schema |
| `20250829062512` | User roles table |
| `20250829063126` | Book positions table |
| `20250829063240` | Fetch cache and audiences |
| `20250918191143` | Additional indexes |
| `20251015161000` | Weeks on list batch tracking |
| `20251016120000` | Secure backend new tables |
| `20251016120100` | Optimized indexes |
| `20251016120200` | RLS policies |
| `20251016120300` | Secure backend rollback function |
| `20251016120400` | Cron jobs setup (pg_cron, pg_net) |
| `20251020200000` | Config table for cron |
| `20251020200100` | Update cron jobs to use config |
| `20251020203000` | Job tracking tables |
| `20251021120000` | List date column for switches |

## Related Documentation

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Database Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Environment Setup](../ENVIRONMENT_SETUP.md)
- [Production Data Isolation Plan](../plans/2025-11-03-production-data-isolation.md)

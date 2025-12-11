# Operations Runbook

## Overview

This runbook covers operational procedures for Better Bestsellers infrastructure.

## Environments

### Production
- **URL:** https://betterbestsellers.app
- **Supabase:** auwllsalgwiwdzohpmum.supabase.co
- **Users:** Live customers
- **Data:** Real bestseller lists
- **Uptime SLA:** 99.9%

### Staging
- **URL:** N/A (local dev only)
- **Supabase:** gyqbhphtgjlqczxhsoki.supabase.co
- **Users:** Development team
- **Data:** Synthetic test data
- **Uptime SLA:** Best effort

## Deployment Procedures

### Promoting Staging to Production

**Prerequisites:**
- [ ] All tests passing in staging
- [ ] Manual QA completed
- [ ] PR approved and merged to main
- [ ] Migrations tested in staging
- [ ] Feature flags configured

**Steps:**

1. **Pre-deployment checks**
   ```bash
   # Verify staging health
   npm run dev:staging
   # Test all critical flows

   # Check migration status
   npm run db:staging
   supabase migration list
   ```

2. **Backup production** (if schema changes)
   ```bash
   npm run db:prod
   supabase db dump > backups/pre-deploy-$(date +%Y%m%d-%H%M%S).sql
   ```

3. **Apply migrations** (if any)
   ```bash
   npm run db:push
   # Preflight check will prompt for confirmation
   ```

4. **Build and deploy frontend**
   ```bash
   npm run build:prod
   # Deploy to hosting (Vercel/Netlify/etc.)
   ```

5. **Post-deployment verification**
   ```bash
   # Visit production URL
   # Test critical flows:
   # - Load bestseller lists
   # - Filter by audience
   # - Generate PDF
   # - Export CSV
   ```

6. **Monitor for issues**
   - Watch Supabase logs for 30 minutes
   - Check error tracking (if integrated)
   - Monitor user reports

### Rollback Procedure

If deployment causes issues:

1. **Immediate actions**
   ```bash
   # Revert to previous build
   # (depends on hosting platform)

   # If migration caused issue:
   npm run db:prod
   supabase migration new rollback_issue_xyz
   # Write reverse migration
   npm run db:push
   ```

2. **Restore from backup** (last resort)
   ```bash
   # Stop application (prevent writes)

   # Restore database
   npm run db:prod
   psql $DATABASE_URL < backups/pre-deploy-YYYYMMDD-HHMMSS.sql

   # Restart application with previous build
   ```

3. **Post-rollback**
   - Verify application working
   - Document what went wrong
   - Create incident report
   - Plan fix for next deployment

## Monitoring & Alerts

### Key Metrics

**Application Health:**
- Page load time < 3s
- API response time < 500ms
- Error rate < 1%
- Uptime > 99.9%

**Database:**
- Connection pool < 80% utilized
- Query time p95 < 100ms
- Active connections < 50
- Storage usage (alert at 80%)

### Supabase Dashboard

Access: https://supabase.com/dashboard

**Daily checks:**
- [ ] Database size (under quota)
- [ ] API requests (under quota)
- [ ] Edge function invocations
- [ ] Active users

**Weekly checks:**
- [ ] Storage usage trend
- [ ] Failed requests (investigate spikes)
- [ ] Slow queries (optimize if found)

### Log Monitoring

**Production logs:**
```bash
# View recent edge function logs
supabase functions logs fetch-pnba-lists --limit 100

# View real-time logs
supabase functions logs fetch-pnba-lists --follow
```

**Error patterns to watch:**
- HTTP 500 errors
- Database connection failures
- Authentication errors
- Rate limit exceeded

## Incident Response

### Severity Levels

**P0 - Critical**
- Site completely down
- Data corruption
- Security breach

**P1 - High**
- Major feature broken
- Performance degraded > 50%
- Affecting > 25% of users

**P2 - Medium**
- Minor feature broken
- Affecting < 25% of users
- Workaround available

**P3 - Low**
- Cosmetic issues
- Affecting < 5% of users
- No immediate impact

### Response Process

1. **Acknowledge**
   - Respond within SLA (P0: 15min, P1: 1hr, P2: 4hr, P3: 1 day)
   - Update status page if public-facing

2. **Assess**
   - Determine severity
   - Identify root cause
   - Estimate time to fix

3. **Mitigate**
   - Implement temporary fix if possible
   - Rollback if necessary
   - Disable feature flag if applicable

4. **Resolve**
   - Deploy permanent fix
   - Verify resolution
   - Monitor for recurrence

5. **Document**
   - Write incident report
   - Update runbook
   - Schedule post-mortem if P0/P1

## Maintenance Windows

### Scheduled Maintenance

**Timing:** Tuesdays 2-4 AM PT (lowest traffic)

**Communication:**
- Notify users 72 hours in advance
- Update status page
- Post in application (if applicable)

**Procedure:**
1. Backup database
2. Apply changes
3. Run smoke tests
4. Monitor for 1 hour
5. Update status page

### Emergency Maintenance

If critical fix needed immediately:
- Skip user notification (unless extended outage)
- Follow deployment procedure
- Document in incident report
- Communicate after resolution

## Data Management

### Backups

**Automatic:**
- Supabase: Daily backups (30-day retention)
- Verify: Check Supabase Dashboard → Backups

**Manual (before major changes):**
```bash
npm run db:prod
supabase db dump > backups/manual-$(date +%Y%m%d-%H%M%S).sql
```

### Data Retention

**Production:**
- Bestseller lists: 52 weeks
- Book positions: 52 weeks
- User data: Indefinite (until account deletion)
- Switches data: 12 weeks

**Staging:**
- All data: Transient (reset as needed)

### Data Sanitization

When copying production data to staging:

```sql
-- Remove real user data
UPDATE auth.users SET email = 'test-' || id || '@example.com';

-- Keep structure, sanitize content
UPDATE bestseller_list_metadata SET raw_text_url = 'https://test.example.com';
```

## Performance Optimization

### Database Optimization

**Monthly tasks:**
```sql
-- Analyze query performance
SELECT * FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE 'pg_toast%';

-- Vacuum analyze
VACUUM ANALYZE;
```

### Edge Function Optimization

Monitor execution time:
```bash
# Check average execution time
supabase functions logs fetch-pnba-lists | grep "Duration"
```

If > 5 seconds:
- Review external API calls
- Check database query performance
- Consider caching strategies

## Security

### Detecting .env Mixups (Preflight Safety System)

**Purpose:** Prevent accidental destructive operations against production database from local development machines.

**How it works:**
1. **Automatic checks:** The `scripts/preflight-check.ts` script runs before destructive operations (migrations, seeding, resets)
2. **Production detection:** Scans `.env` file for production Supabase URL (`auwllsalgwiwdzohpmum.supabase.co`)
3. **Blocking behavior:** Refuses to run if production URL detected (unless explicitly allowed with `--allow-production` flag)

**Integration:**
```bash
# All destructive operations use preflight check:
npm run seed:staging        # ✅ Blocked if production detected
npm run db:reset:staging    # ✅ Blocked if production detected
npm run db:push             # ✅ Requires --allow-production for prod

# Read-only operations work normally:
npm run supabase:status     # ✅ Always allowed
supabase projects list      # ✅ Always allowed
```

**Common Scenarios:**

**Scenario 1: Accidentally using .env with production URL**
```bash
$ npm run seed:staging

❌ DANGER: Production database detected!
URL: auwllsalgwiwdzohpmum.supabase.co
This operation is NOT allowed against production from local machines.

Fix: Switch to staging: cp .env.staging .env
```

**Scenario 2: Forgot to switch environments**
```bash
$ npm run db:reset:staging

❌ DANGER: Production database detected!
Currently using: production backend
This operation requires staging backend.

Fix: Run 'npm run dev:staging' or 'cp .env.staging .env'
```

**Scenario 3: Intentional production operation (rare)**
```bash
# Only use this if you REALLY need to operate on production
$ npm run db:push

⚠️  WARNING: Operating on PRODUCTION database
URL: auwllsalgwiwdzohpmum.supabase.co
Are you sure? (yes/no): yes

Proceeding with production operation...
```

**Troubleshooting:**

| Error Message | Cause | Fix |
|--------------|-------|-----|
| "Production database detected!" | `.env` contains production URL | Switch to `.env.staging` or update `VITE_SUPABASE_URL` |
| "No .env file found" | Missing environment configuration | Copy `.env.example` to `.env` |
| "Invalid Supabase URL format" | Malformed URL in `.env` | Check URL format: `https://[project-ref].supabase.co` |

**Best Practices:**
- ✅ Use `.env.staging` for local development (copy from `.env.example`)
- ✅ Keep `.env.production` in password manager (not in codebase)
- ✅ Run `npm run db:staging` when setting up new machine
- ❌ Never commit `.env` files to git (already in `.gitignore`)
- ❌ Never use destructive operations against production locally

### Access Control

**Production Access:**
- Service role key: Stored in password manager (2 admins)
- Anon key: Public (in frontend code)
- Database password: Rotated every 90 days

**Staging Access:**
- Service role key: Shared with dev team
- Anon key: Public (in .env.staging)
- Database password: Developer-accessible

### Security Audit Checklist

**Monthly:**
- [ ] Review RLS policies (ensure no public writes)
- [ ] Check edge function authentication
- [ ] Audit user permissions
- [ ] Review API usage patterns for abuse

**Quarterly:**
- [ ] Rotate service role keys
- [ ] Update dependencies (npm audit fix)
- [ ] Review CORS policies
- [ ] Scan for exposed secrets

### Incident Reporting

If security issue discovered:
1. **Immediate:** Disable affected functionality
2. **Assess:** Determine scope and impact
3. **Fix:** Deploy patch ASAP
4. **Notify:** Inform affected users if data exposed
5. **Document:** Security incident report

## Contact Information

**Primary Maintainer:**
- Name: Steven Pate
- Email: stevenpate@gmail.com

**Escalation:**
- Supabase Support: support@supabase.io

**External Services:**
- Hosting: [Vercel/Netlify support]
- DNS: [Cloudflare/Route53 support]

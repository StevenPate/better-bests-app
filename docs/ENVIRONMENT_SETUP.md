# Environment Configuration Guide

## Overview

Better Bestsellers supports multiple environments for safe feature development:
- **Production**: Live data, stable features only
- **Staging**: Test data, experimental features enabled
- **Development**: Local with either prod or staging backend

## Quick Start

### Production (Default)

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in production Supabase credentials:
   ```bash
   VITE_SUPABASE_URL="https://auwllsalgwiwdzohpmum.supabase.co"
   VITE_SUPABASE_ANON_KEY="[prod-anon-key]"
   ```

3. Run: `npm run dev`

### Staging

1. Use the existing `.env.staging` file (already configured):
   ```bash
   # .env.staging contains:
   # VITE_SUPABASE_URL="https://gyqbhphtgjlqczxhsoki.supabase.co"
   # VITE_SUPABASE_ANON_KEY="[staging-anon-key]"
   # VITE_ENABLE_DEBUG_LOGS="true"
   # VITE_ENVIRONMENT="staging"
   ```

2. Run with staging environment:
   ```bash
   cp .env.staging .env
   npm run dev
   ```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public anon key | `eyJ...` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_GOOGLE_BOOKS_API_KEY` | None | Higher quota for Google Books API |
| `VITE_ENABLE_DEBUG_LOGS` | `false` | Verbose logging (debug/info messages) |
| `VITE_ENVIRONMENT` | `"production"` | Environment name for identification |
| `VITE_ENABLE_MULTI_REGION` | `false` | Multi-region features (9 regional associations) |

## Feature Flags

### VITE_ENABLE_MULTI_REGION

Controls access to multi-region functionality:
- `false` (default): PNBA-only mode (production)
- `true`: All 9 regions enabled (PNBA, SIBA, CALIBAN, CALIBAS, GLIBA, MPIBA, MIBA, NAIBA, NEIBA)

**Default-Off Safety:**
All feature flags default to `false` in production. Per-environment overrides allow staging to test features before production rollout.

**Usage in code:**
```typescript
import { ENV } from '@/lib/environment';

if (ENV.multiRegionEnabled) {
  // Show multi-region UI
} else {
  // Show PNBA-only UI
}
```

**Environment Configuration:**
```bash
# Production (.env or omit variable)
VITE_ENABLE_MULTI_REGION="false"  # or omit entirely

# Staging (.env.staging)
VITE_ENABLE_MULTI_REGION="true"   # Enable for testing
```

## Switching Environments

### Method 1: Manual Environment Files

```bash
# Switch to staging
cp .env.staging .env
npm run dev

# Switch back to production
cp .env.production .env
npm run dev
```

### Method 2: NPM Scripts (Recommended for Future)

You can add convenience scripts to `package.json`:
```json
"scripts": {
  "dev:staging": "cp .env.staging .env && vite",
  "dev:prod": "cp .env.production .env && vite"
}
```

Usage:
```bash
npm run dev:staging  # Run with staging backend
npm run dev:prod     # Run with production backend
```

## Environment Detection in Code

Use the environment utility to detect the current environment:

```typescript
import { ENV, getEnvironmentName } from '@/lib/environment';

// Check environment type
if (ENV.isProduction) {
  // Production-specific logic
}

if (ENV.isStaging) {
  // Staging-specific logic (e.g., show debug info)
}

// Get environment name for display
console.log(`Running in ${getEnvironmentName()}`);

// Check feature flags
if (ENV.multiRegionEnabled) {
  // Multi-region code
}

// Access Supabase URL
console.log(`Connected to: ${ENV.supabaseUrl}`);
```

## Safety Checklist

Before deploying or testing:

- [ ] Never commit `.env`, `.env.staging`, or `.env.production` to git (already in `.gitignore`)
- [ ] Always verify `VITE_SUPABASE_URL` before testing with `cat .env | grep VITE_SUPABASE_URL`
- [ ] Use staging for all experimental features
- [ ] Test migrations in staging first before applying to production
- [ ] Keep service role keys in password manager only (never in `.env` files)
- [ ] Feature flags should default to `false` (off) in production
- [ ] Enable feature flags in staging first to test before production rollout

## Troubleshooting

### Wrong environment connected

**Symptom:** Data doesn't match expectations, unexpected behavior

**Check `.env` file:**
```bash
cat .env | grep VITE_SUPABASE_URL
```

**Expected URLs:**
- Production: `https://auwllsalgwiwdzohpmum.supabase.co`
- Staging: `https://gyqbhphtgjlqczxhsoki.supabase.co`

### Missing environment variables

**Error:** `Missing VITE_SUPABASE_URL` or similar validation error

**Solution:**
```bash
# Copy example file
cp .env.example .env

# Fill in required values
# VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required
```

### Feature flag not working

**Symptom:** Feature flag changes don't take effect

**Solutions:**

1. **Restart dev server** (environment variables are loaded at build time):
   ```bash
   # Stop dev server (Ctrl+C)
   npm run dev
   ```

2. **Clear browser localStorage** (may cache feature state):
   ```javascript
   // In browser console:
   localStorage.clear()
   location.reload()
   ```

3. **Verify environment variable format** (strings, not booleans):
   ```bash
   # Correct (string)
   VITE_ENABLE_MULTI_REGION="true"

   # Incorrect (boolean - won't work)
   VITE_ENABLE_MULTI_REGION=true
   ```

### Environment mismatch between CLI and app

**Symptom:** Supabase CLI operations affect different database than app

**Check both:**
```bash
# Check Supabase CLI link
grep "project_id" supabase/config.toml

# Check app environment
cat .env | grep VITE_SUPABASE_URL
```

**Fix:** Ensure both point to same environment:
```bash
# For staging:
supabase link --project-ref gyqbhphtgjlqczxhsoki
cp .env.staging .env

# For production:
supabase link --project-ref auwllsalgwiwdzohpmum
cp .env.production .env
```

## Related Documentation

- [Supabase Migrations Guide](operations/supabase-migrations.md) - Schema management across environments
- [Production Data Isolation Plan](plans/2025-11-03-production-data-isolation.md) - Multi-environment strategy

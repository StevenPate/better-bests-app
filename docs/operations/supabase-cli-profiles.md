# Supabase CLI Profiles

## Available Profiles

### Production
- Project: Better Bestsellers (Production)
- Ref: auwllsalgwiwdzohpmum
- Usage: `supabase db push --linked`

### Staging
- Project: Better Bestsellers - Staging
- Ref: gyqbhphtgjlqczxhsoki
- Usage: `supabase link --project-ref [staging-ref]`

## Switching Between Environments

```bash
# Link to staging
supabase link --project-ref gyqbhphtgjlqczxhsoki

# Link back to production
supabase link --project-ref auwllsalgwiwdzohpmum
```

## Safety Rules

1. **NEVER** run destructive commands against production without confirmation
2. Always verify linked project before migrations: `supabase status`
3. Test all migrations in staging first
4. Use `--dry-run` flag when available
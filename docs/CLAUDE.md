# Claude Code Guidelines

This document contains guidelines for Claude Code when working on this project.

## Commit Messages

When creating git commits:

- **DO NOT** include "Generated with Claude Code" footer
- **DO NOT** include "Co-Authored-By: Claude" footer
- Claude is already credited in the site's About page
- Keep commit messages streamlined and focused on the technical changes

### Commit Message Format

```
<type>: <short summary>

<detailed description of changes>

<technical details, file paths, implementation notes>
```

### Example

```
Fix book audience update error in multi-region system

Resolves HTTP 406 error when updating book audiences by fixing
conflicting UNIQUE constraints and adding region support.

Changes:
- Migration: Drop incorrect UNIQUE (isbn) constraint, ensure correct
  UNIQUE (region, isbn) constraint exists
- bestsellerParser.ts: Add region parameter to updateBookAudience(),
  include region in upsert with proper onConflict clause
- BookDetail.tsx: Import and use useRegion() hook, pass current region
  to updateBookAudience()

The book_audiences table now correctly supports per-region audience
classifications as designed for the multi-region architecture.
```

## General Guidelines

- Always ask before pushing commits to remote
- Build and verify changes before committing
- Keep commits focused on a single logical change
- Include migration files when making database schema changes

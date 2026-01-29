# Project Conventions

This document outlines the organizational conventions and file structure standards for this project.

## File Organization

### Root Directory Structure

```
MongoDB-reindexer/
├── .github/
│   └── internal/          # Internal docs (NOT committed/distributed)
├── src/                   # TypeScript source code
├── help/                  # User-facing help files (deprecated, use locales/)
├── locales/               # Internationalization files
├── examples/              # Usage examples
├── test/                  # Test files
├── README.md              # Main user documentation
├── CONTRIBUTING.md        # Contributor guidelines
├── CONVENTIONS.md         # This file
├── LICENSE                # License information
└── package.json           # Package configuration
```

## Documentation Placement Rules

### Rule 1: Internal vs. Public Documentation

**Internal Documentation** (`.github/internal/`):
- Implementation summaries
- Development process notes
- Architecture decision records
- Refactoring summaries
- Internal design documents
- Technical deep-dives for maintainers

**Public Documentation** (Root directory):
- `README.md` - User-facing project documentation
- `CONTRIBUTING.md` - How to contribute to the project
- `LICENSE` - Legal license information
- `CHANGELOG.md` - Version history (if created)
- `CODE_OF_CONDUCT.md` - Community guidelines (if created)

**Why this matters:**
- Keeps the root directory clean and user-focused
- Prevents information overload for new users
- Separates implementation details from usage documentation
- Reduces package size (internal docs excluded from npm)

### Rule 2: Internal Documentation is NOT Committed

Files in `.github/internal/` are:
- Excluded from git via `.gitignore`
- Excluded from npm packages via `.npmignore`
- Available only in the development environment
- Not distributed to end users

### Rule 3: Help Files are Localized

- **OLD**: `help/prompts/*.json` (deprecated, for backward compatibility)
- **NEW**: `locales/{locale}/prompts/*.json` (current standard)

All user-facing help and messages should be in locale-specific directories under `locales/`.

## Enforcement

### Automated Validation

Run the validation script to check for misplaced files:

```bash
npm run validate:structure
```

This script checks for:
- Summary files in the root directory (should be in `.github/internal/`)
- Internal docs accidentally committed
- Files in wrong locations

### Pre-Commit Checks

The validation script can be added to a pre-commit hook to prevent mistakes:

```bash
#!/bin/sh
npm run validate:structure
```

## Examples

### ✅ Correct Placement

```
.github/internal/IMPLEMENTATION_SUMMARY.md  # Internal implementation notes
.github/internal/LOCALIZATION_SUMMARY.md    # Internal feature summary
README.md                                    # Public user documentation
locales/en/messages.json                    # Localized user messages
```

### ❌ Incorrect Placement

```
IMPLEMENTATION_SUMMARY.md                   # Should be in .github/internal/
FEATURE_SUMMARY.md                          # Should be in .github/internal/
internal-notes.md                           # Should be in .github/internal/
```

## Adding New Files

### When Creating Internal Documentation:

1. Create file in `.github/internal/`
2. Use descriptive filename (e.g., `FEATURE_NAME_SUMMARY.md`)
3. Add purpose statement at top of file
4. Verify it's listed in `.gitignore` pattern
5. Run `npm run validate:structure` to confirm

### When Creating Public Documentation:

1. Create file in root directory
2. Ensure it's user-facing and valuable to users
3. Link from README.md if appropriate
4. Add to table of contents if needed

## Rationale

**Why separate internal documentation?**

1. **User Focus**: Users see only what they need (README, CONTRIBUTING, LICENSE)
2. **Clean Repository**: Avoids clutter in the main directory
3. **Smaller Packages**: npm packages don't include internal notes
4. **Clear Boundaries**: Obvious distinction between user and developer docs
5. **Maintainability**: Easy to update internal docs without affecting user docs

**Why `.github/internal/`?**

- `.github/` is a recognized GitHub special directory
- Clearly indicates GitHub-specific/internal content
- Easy to exclude from distributions
- Standard pattern in many projects

## Migration

If you find files that should be moved:

```bash
# Move to internal
git mv SOME_SUMMARY.md .github/internal/

# Update any references
git grep -l "SOME_SUMMARY.md" | xargs sed -i 's|SOME_SUMMARY.md|.github/internal/SOME_SUMMARY.md|g'

# Commit
git commit -m "Move internal documentation to .github/internal/"
```

## Questions?

See [CONTRIBUTING.md](CONTRIBUTING.md) for more information on contributing to this project.

---

**Last Updated:** 2026-01-29  
**Version:** 1.0.0

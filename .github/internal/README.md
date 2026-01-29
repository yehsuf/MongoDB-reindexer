# Internal Documentation

This directory contains **internal documentation** that is **NOT** intended for public distribution.

## Purpose

The `.github/internal/` directory is used to store:
- Implementation summaries
- Development notes
- Internal design documents
- Architecture decision records (ADRs)
- Refactoring summaries
- Technical deep-dives

These documents are for **maintainers and contributors** only and provide context about the development process, design decisions, and implementation details that are not relevant to end users.

## Exclusion from Distribution

Files in this directory are **automatically excluded** from:
- Git commits (via `.gitignore`)
- NPM packages (via `.npmignore`)
- GitHub releases

## What Goes Here vs. Root Directory

### ✅ Place in `.github/internal/`:
- Implementation summaries (IMPLEMENTATION_SUMMARY.md)
- Feature development summaries (LOCALIZATION_SUMMARY.md)
- Internal system documentation (HELP_SYSTEM.md)
- Architecture decision records
- Refactoring notes
- Development process documentation

### ✅ Place in Root Directory:
- README.md (user-facing documentation)
- CONTRIBUTING.md (contributor guide)
- LICENSE (legal requirement)
- CHANGELOG.md (version history for users)
- CODE_OF_CONDUCT.md (community standards)

## Current Files

This directory contains:
1. **IMPLEMENTATION_SUMMARY.md** - Complete implementation details and metrics
2. **LOCALIZATION_SUMMARY.md** - i18n system implementation summary
3. **HELP_SYSTEM.md** - Interactive help system documentation

## Adding New Internal Documentation

When creating new internal documentation:

1. Create the file in `.github/internal/`
2. Use clear, descriptive filenames (e.g., `FEATURE_NAME_SUMMARY.md`)
3. Document the purpose and scope at the top of each file
4. Reference these docs in CONTRIBUTING.md if relevant
5. The validation script will ensure they stay excluded

## Enforcement

The following mechanisms ensure internal docs stay internal:

1. **`.gitignore`** - Prevents accidental commits
2. **`.npmignore`** - Prevents package inclusion  
3. **Validation script** - Checks for misplaced files
4. **CONVENTIONS.md** - Documents the pattern
5. **CONTRIBUTING.md** - Guides contributors

---

**Note:** If you're a contributor and need access to these files, they are available in the development repository but will not be published to npm or included in releases.

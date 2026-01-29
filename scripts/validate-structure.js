#!/usr/bin/env node

/**
 * Project Structure Validation Script
 * 
 * Validates that files are in the correct locations according to CONVENTIONS.md
 * Prevents internal documentation from being committed to root directory.
 */

const fs = require('fs');
const path = require('path');

// Define patterns for files that should be in .github/internal/
const INTERNAL_DOC_PATTERNS = [
    /^[A-Z_]+SUMMARY\.md$/i,           // *_SUMMARY.md, *SUMMARY.md
    /^IMPLEMENTATION.*\.md$/i,          // IMPLEMENTATION*.md
    /^LOCALIZATION.*\.md$/i,            // LOCALIZATION*.md
    /^HELP_SYSTEM.*\.md$/i,             // HELP_SYSTEM*.md
    /^REFACTORING.*\.md$/i,             // REFACTORING*.md
    /^ARCHITECTURE.*\.md$/i,            // ARCHITECTURE*.md
    /^DESIGN.*\.md$/i,                  // DESIGN*.md
    /^INTERNAL.*\.md$/i,                // INTERNAL*.md
    /^DEV_NOTES.*\.md$/i,               // DEV_NOTES*.md
    /^ADR[-_].*\.md$/i,                 // ADR-*.md, ADR_*.md (Architecture Decision Records)
];

// Files that are allowed in root (exceptions)
const ALLOWED_ROOT_DOCS = [
    'README.md',
    'CONTRIBUTING.md',
    'CONVENTIONS.md',
    'LICENSE',
    'LICENSE.md',
    'CHANGELOG.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    '.github',
];

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}

function isInternalDoc(filename) {
    return INTERNAL_DOC_PATTERNS.some(pattern => pattern.test(filename));
}

function isAllowedInRoot(filename) {
    return ALLOWED_ROOT_DOCS.includes(filename);
}

function validateProjectStructure() {
    console.log(colorize('\n🔍 Validating project structure...\n', 'cyan'));
    
    let errors = [];
    let warnings = [];
    
    // Check root directory for misplaced internal docs
    const rootFiles = fs.readdirSync('.').filter(f => {
        const stat = fs.statSync(f);
        return stat.isFile() && (f.endsWith('.md') || f === 'LICENSE');
    });
    
    console.log(colorize('Checking root directory files...', 'blue'));
    
    for (const file of rootFiles) {
        const isInternal = isInternalDoc(file);
        const isAllowed = isAllowedInRoot(file);
        
        if (isInternal) {
            errors.push({
                file: file,
                issue: 'Internal documentation found in root directory',
                fix: `Move to .github/internal/: git mv ${file} .github/internal/`,
            });
        } else if (!isAllowed && file.endsWith('.md')) {
            warnings.push({
                file: file,
                issue: 'Unexpected markdown file in root',
                note: 'Consider if this should be in .github/internal/ or is truly user-facing',
            });
        } else {
            console.log(`  ${colorize('✓', 'green')} ${file}`);
        }
    }
    
    // Check .github/internal exists if we have any rules
    if (!fs.existsSync('.github/internal')) {
        warnings.push({
            file: '.github/internal/',
            issue: 'Directory does not exist',
            note: 'Will be created when internal docs are added',
        });
    } else {
        console.log(`\n${colorize('Checking .github/internal/ directory...', 'blue')}`);
        const internalFiles = fs.readdirSync('.github/internal').filter(f => {
            const stat = fs.statSync(path.join('.github/internal', f));
            return stat.isFile();
        });
        console.log(`  ${colorize('✓', 'green')} Found ${internalFiles.length} internal doc(s)`);
        internalFiles.forEach(f => console.log(`    - ${f}`));
    }
    
    // Check .gitignore includes .github/internal
    console.log(`\n${colorize('Checking .gitignore configuration...', 'blue')}`);
    if (fs.existsSync('.gitignore')) {
        const gitignore = fs.readFileSync('.gitignore', 'utf8');
        if (gitignore.includes('.github/internal')) {
            console.log(`  ${colorize('✓', 'green')} .github/internal/ is excluded from git`);
        } else {
            errors.push({
                file: '.gitignore',
                issue: 'Missing .github/internal/ exclusion',
                fix: 'Add ".github/internal/" to .gitignore',
            });
        }
    }
    
    // Check .npmignore includes .github
    console.log(`${colorize('Checking .npmignore configuration...', 'blue')}`);
    if (fs.existsSync('.npmignore')) {
        const npmignore = fs.readFileSync('.npmignore', 'utf8');
        if (npmignore.includes('.github')) {
            console.log(`  ${colorize('✓', 'green')} .github/ is excluded from npm package`);
        } else {
            errors.push({
                file: '.npmignore',
                issue: 'Missing .github/ exclusion',
                fix: 'Add ".github/" to .npmignore',
            });
        }
    }
    
    // Print results
    console.log('\n' + '='.repeat(60));
    
    if (errors.length === 0 && warnings.length === 0) {
        console.log(colorize('\n✅ Project structure validation PASSED!', 'green'));
        console.log('All files are in their correct locations.\n');
        return 0;
    }
    
    if (errors.length > 0) {
        console.log(colorize(`\n❌ Found ${errors.length} error(s):\n`, 'red'));
        errors.forEach((err, i) => {
            console.log(colorize(`${i + 1}. ${err.file}`, 'red'));
            console.log(`   Issue: ${err.issue}`);
            console.log(colorize(`   Fix: ${err.fix}`, 'yellow'));
            console.log('');
        });
    }
    
    if (warnings.length > 0) {
        console.log(colorize(`\n⚠️  Found ${warnings.length} warning(s):\n`, 'yellow'));
        warnings.forEach((warn, i) => {
            console.log(colorize(`${i + 1}. ${warn.file}`, 'yellow'));
            console.log(`   Issue: ${warn.issue}`);
            console.log(`   Note: ${warn.note}`);
            console.log('');
        });
    }
    
    if (errors.length > 0) {
        console.log(colorize('❌ Validation FAILED. Please fix the errors above.', 'red'));
        console.log('\nSee CONVENTIONS.md for file organization guidelines.\n');
        return 1;
    } else {
        console.log(colorize('✅ Validation PASSED (with warnings).', 'green'));
        console.log('Consider addressing the warnings above.\n');
        return 0;
    }
}

// Run validation
const exitCode = validateProjectStructure();
process.exit(exitCode);

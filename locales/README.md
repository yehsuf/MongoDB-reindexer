# Localization System

This directory contains internationalization (i18n) resources for the MongoDB Reindexer.

## Structure

```
locales/
├── config.json           # Locale configuration (default, supported, fallback)
├── en/                   # English (default locale)
│   ├── messages.json     # Common messages and UI text
│   └── prompts/          # Interactive prompt help files
│       ├── cleanup.json
│       ├── collections.json
│       ├── collection-specify.json
│       ├── indexes.json
│       └── index-specify.json
└── README.md            # This file
```

## Supported Locales

Currently supported locales:
- **en** (English) - Default locale

## Adding a New Locale

To add support for a new language (e.g., Spanish):

1. **Create locale directory:**
   ```bash
   mkdir -p locales/es/prompts
   ```

2. **Copy and translate files:**
   ```bash
   cp locales/en/messages.json locales/es/messages.json
   cp locales/en/prompts/*.json locales/es/prompts/
   ```

3. **Translate the content:**
   - Edit `messages.json` - Translate all message strings
   - Edit prompt files - Translate descriptions and details

4. **Update configuration:**
   Edit `locales/config.json`:
   ```json
   {
     "defaultLocale": "en",
     "supportedLocales": ["en", "es"],
     "fallbackLocale": "en"
   }
   ```

5. **Test the translation:**
   ```bash
   LOCALE=es npm start rebuild --database mydb
   ```

## File Formats

### messages.json

Contains common UI text and messages:

```json
{
  "common": {
    "key": "Translated text with {placeholders}"
  },
  "errors": { ... },
  "messages": { ... },
  "prompts": { ... }
}
```

**Placeholders** are replaced at runtime:
- `{database}` - Database name
- `{count}` - Numeric count
- `{file}` - File path
- `{name}` - Collection/index name
- `{options}` - List of options

### prompts/*.json

Interactive prompt help files follow this schema:

```json
{
  "id": "unique-identifier",
  "question": "Translated question",
  "options": [
    {
      "value": "option-name",
      "shortcut": "letter",
      "description": "Translated brief description",
      "details": "Translated extended explanation"
    }
  ],
  "context": "Translated context information"
}
```

**Important:** Keep the `value` and `shortcut` fields in English for consistency.

## Using Locales in Code

The locale system is integrated into the `promptUser` function:

```typescript
import { promptUser } from './utils';

// Loads help from locales/{locale}/prompts/cleanup.json
const [choice, word] = await promptUser(
  "Proceed with cleanup? (y/n): ",
  ['yes', 'no'],
  'cleanup'
);
```

Messages are loaded via the i18n utility:

```typescript
import { t } from './utils';

console.log(t('messages.starting_rebuild', { database: 'mydb' }));
// Output: ### Starting UNIVERSAL index rebuild for database: "mydb" ###
```

## Locale Detection

The system determines the locale in this order:

1. **LOCALE environment variable:** `LOCALE=es npm start`
2. **System locale:** Falls back to system's default
3. **Default locale:** Uses `en` from config.json

## Best Practices

1. **Keep keys consistent:** Use the same key structure across all locales
2. **Preserve placeholders:** Don't translate `{variable}` names
3. **Maintain formatting:** Keep emoji, symbols, and formatting consistent
4. **Test thoroughly:** Verify all prompts and messages display correctly
5. **Document context:** Add comments for ambiguous strings

## Translation Guidelines

### Do's
- ✅ Translate user-facing text
- ✅ Adapt to cultural norms (date formats, number formats)
- ✅ Keep technical terms consistent
- ✅ Maintain the same tone and formality

### Don'ts
- ❌ Don't translate option values (yes/no/specify/skip)
- ❌ Don't translate placeholder names ({database}, {count})
- ❌ Don't change JSON structure
- ❌ Don't remove or add fields without updating all locales

## Validation

Before submitting translations:

1. **JSON validation:**
   ```bash
   cat locales/es/messages.json | python3 -m json.tool
   ```

2. **Build test:**
   ```bash
   npm run build
   ```

3. **Interactive test:**
   ```bash
   LOCALE=es node dist/cli.js rebuild --help
   ```

## Contributing

To contribute translations:

1. Fork the repository
2. Create a new locale directory
3. Translate all files
4. Update config.json
5. Test your translation
6. Submit a pull request

Include:
- Native speaker review (if possible)
- Screenshots of key prompts
- Notes about cultural adaptations

## Future Enhancements

Planned features:
- [ ] Automatic locale detection from system
- [ ] Plural forms support
- [ ] Date/time localization
- [ ] Number formatting
- [ ] RTL (right-to-left) language support
- [ ] Translation memory
- [ ] Professional translation service integration

## Support

For translation questions or issues:
- Open an issue on GitHub
- Tag with `i18n` or `translation`
- Provide locale code and context

---

**Current Status:** Basic i18n infrastructure implemented with English (en) locale.

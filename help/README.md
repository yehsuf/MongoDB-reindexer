# Help Files Directory

This directory contains JSON files that define the help text for interactive prompts in the MongoDB Reindexer.

## Directory Structure

```
help/
├── prompts/           # Help files for each prompt type
│   ├── cleanup.json
│   ├── collections.json
│   ├── collection-specify.json
│   ├── indexes.json
│   └── index-specify.json
└── README.md          # This file
```

## JSON File Format

Each help file follows this schema:

```json
{
  "id": "unique-identifier",
  "question": "The prompt question text",
  "options": [
    {
      "value": "option-name",
      "shortcut": "single-letter",
      "description": "Brief description of what this option does",
      "details": "Extended explanation with more context (optional)"
    }
  ],
  "context": "Additional context about when/why this prompt appears (optional)"
}
```

### Field Descriptions

- **id**: A unique identifier for the prompt (for tracking and debugging)
- **question**: The actual question text shown to the user
- **options**: Array of available choices for this prompt
  - **value**: The full word users can type (e.g., "yes", "no", "specify")
  - **shortcut**: Single letter shortcut (e.g., "y", "n", "s")
  - **description**: Brief one-line explanation (shown in help output)
  - **details**: Optional longer explanation for complex options
- **context**: Optional background information about the prompt

## How Help is Used

When users type `help`, `h`, or `?` at any prompt, the system:

1. Loads the corresponding JSON help file
2. Displays formatted help with all options
3. Shows option values, shortcuts, and descriptions
4. Re-prompts the user without interrupting workflow

## Creating New Help Files

To add help for a new prompt:

1. Create a new JSON file in `help/prompts/`
2. Follow the schema above
3. Use a descriptive filename (e.g., `my-feature.json`)
4. Reference it in the code using: `loadHelpFile('my-feature')`

## Example Usage in Code

```typescript
const [choice, word] = await promptUser(
  "Your question? (y/n): ",
  ['yes', 'no'],
  'cleanup'  // References help/prompts/cleanup.json
);
```

## Localization Support (Future)

The JSON structure supports future localization by allowing:
- Language-specific directories: `help/en/`, `help/es/`, etc.
- Runtime language selection based on environment

## Best Practices

1. **Keep descriptions concise**: One line for the main description
2. **Use details for complexity**: Add extended explanations only when needed
3. **Be consistent**: Use similar phrasing across related prompts
4. **Test help output**: Ensure formatting looks good in the terminal
5. **Include context**: Help users understand when and why they see this prompt

## Maintenance

When updating prompts:
- Update the corresponding JSON file
- Keep the help text synchronized with actual behavior
- Test the help output after changes
- Update this README if adding new patterns

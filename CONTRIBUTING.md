# Contributing to MongoDB Reindexer

Thank you for your interest in contributing to MongoDB Reindexer!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yehsuf/MongoDB-reindexer.git
   cd MongoDB-reindexer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Development Workflow

### File Organization

**IMPORTANT:** Follow the conventions in [CONVENTIONS.md](CONVENTIONS.md):

- **Internal Documentation** goes in `.github/internal/` (not committed/distributed)
  - Implementation summaries
  - Development notes
  - Architecture decision records
  
- **Public Documentation** stays in root directory (user-facing)
  - README.md
  - CONTRIBUTING.md
  - LICENSE

Run validation before committing:
```bash
npm run validate:structure
```

### Building

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Watch mode for development
- `npm run clean` - Remove build artifacts

### Testing

- `npm test` - Run smoke tests
- `npm run lint` - Run ESLint
- `npm run validate:structure` - Validate file organization (run before commits)

### Code Style

- Use TypeScript strict mode
- Follow the existing code style
- Add comments for complex logic
- Ensure all exports have proper types

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Follow file organization conventions (see [CONVENTIONS.md](CONVENTIONS.md))
5. Run validation (`npm run validate:structure`)
6. Run tests and linting (`npm test && npm run lint`)
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to the branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

## Commit Messages

- Use clear and descriptive commit messages
- Start with a verb in present tense (e.g., "Add", "Fix", "Update")
- Keep the first line under 72 characters
- Add detailed description if needed

## Reporting Issues

When reporting issues, please include:

- MongoDB version
- Node.js version
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior
- Error messages and logs

## Questions?

Feel free to open an issue for any questions or concerns.

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

### Building

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Watch mode for development
- `npm run clean` - Remove build artifacts

### Testing

- `npm test` - Run smoke tests
- `npm run lint` - Run ESLint

### Code Style

- Use TypeScript strict mode
- Follow the existing code style
- Add comments for complex logic
- Ensure all exports have proper types

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`npm test && npm run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

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

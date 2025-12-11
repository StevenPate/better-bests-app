# Contributing to Better Bestsellers App

Thank you for your interest in contributing to Better Bestsellers App! We welcome contributions from the community.

## How to Contribute

### Reporting Issues

If you find a bug or have a feature request, please open an issue on our [GitHub Issues](https://github.com/stevenpate/better-bestsellers-app/issues) page. When reporting issues, please include:

- A clear description of the issue
- Steps to reproduce the problem
- Expected behavior vs actual behavior
- Your environment (OS, browser, Node version)
- Any relevant error messages or logs

### Submitting Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following our code style
4. **Test your changes**: `npm test`
5. **Update documentation** if needed
6. **Create a Pull Request** with a clear description

### Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/better-bestsellers-app.git
cd better-bestsellers-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

### Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use the logger utility instead of console.*
- Write tests for new utilities and services
- Use shadcn/ui components for UI elements
- Keep components modular and reusable

### Testing

- Write tests for new features
- Ensure all tests pass: `npm test`
- Aim for good test coverage: `npm run test:coverage`
- Test across different browsers when making UI changes

### Commit Messages

Use clear, descriptive commit messages:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for formatting changes
- `refactor:` for code refactoring
- `test:` for test additions/changes
- `chore:` for maintenance tasks

### Questions?

Feel free to open an issue for any questions or discussions about contributing.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
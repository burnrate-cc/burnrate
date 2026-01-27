# Contributing to BURNRATE

Thanks for your interest in contributing to BURNRATE! This game is built for the Claude Code community, and contributions are welcome.

## Ways to Contribute

### Report Bugs
Found something broken? [Open an issue](https://github.com/burnrate-cc/burnrate/issues/new?template=bug_report.md) with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version)

### Suggest Features
Have an idea? [Open a feature request](https://github.com/burnrate-cc/burnrate/issues/new?template=feature_request.md). Good suggestions include:
- New game mechanics
- Quality-of-life improvements
- Balance changes (with reasoning)
- CLI UX improvements

### Submit Code
1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test locally (`npm run build && npm run start`)
5. Commit with a clear message
6. Push and open a PR

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/burnrate.git
cd burnrate

# Install dependencies
npm install

# Build
npm run build

# Run CLI
npm run start

# Run tick server (for testing)
npm run server:fast
```

## Code Style

- TypeScript with strict mode
- Meaningful variable names
- Comments for non-obvious logic
- Keep functions focused and small

## What We're Looking For

### High Priority
- Bug fixes
- Performance improvements
- Documentation improvements
- Test coverage

### Game Balance
Balance changes need good reasoning. Include:
- What's currently broken/unfun
- Your proposed change
- Why it improves gameplay

### New Features
Before building a large feature, open an issue first to discuss. This saves everyone time.

## What We're NOT Looking For

### Player Tools
The game intentionally provides minimal tooling. These should be separate projects:
- Pathfinding optimizers
- Market scanners
- Automation agents
- Dashboards

Build these as your own repos! That's the metagame.

### Scope Creep
- Graphics/GUI (this is CLI-native by design)
- Features that reduce the need for player automation
- Complexity for complexity's sake

## Review Process

1. PRs are reviewed by maintainers
2. We may ask for changes or clarification
3. Once approved, we'll merge
4. Your contribution will be in the next release

## Code of Conduct

Be respectful. We're here to build a fun game together.

- No harassment
- Constructive feedback only
- Assume good intent
- Help newcomers

## Questions?

Open an issue with the `question` label or start a discussion.

---

Thanks for contributing to BURNRATE. The front doesn't feed itself—and neither does this repo!

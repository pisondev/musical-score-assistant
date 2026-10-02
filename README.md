# Musical Score Assistant

A personal practice tool for pianists who read numbered notation (_not angka_). It shows a song as
a two-row numbered score, offers several left-hand arrangements to choose from, and plays them
back so each idea can be heard before it is practised.

The project is in its initial setup stage. See [CHANGELOG.md](CHANGELOG.md) for progress.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Getting started

```bash
npm install
```

`npm install` also points git at the versioned hooks in `.githooks/`.

## Commands

| Command             | Purpose                         |
| ------------------- | ------------------------------- |
| `npm run lint`      | Lint the source with ESLint     |
| `npm run typecheck` | Type-check the project          |
| `npm test`          | Run the unit tests              |
| `npm run format`    | Format the source with Prettier |

## Contributing

Repository rules live in [CLAUDE.md](CLAUDE.md). In short: commits follow Conventional Commits,
are written in English, and must not carry AI attribution; a `commit-msg` hook enforces the last
point.

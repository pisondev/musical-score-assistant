# Project rules

These rules apply to every change in this repository.

1. **Commit and push only on explicit request.** Never run `git commit` or `git push` unless the
   user asks for it in so many words. Permission given for one task does not carry over to the next.
2. **Verify before committing.** Run `npm run verify` (lint, type check, tests, song check, build)
   and make sure it passes. Do not commit code that has not been run.
3. **Keep the documentation current.** Update `README.md`, `CHANGELOG.md`, and anything under
   `docs/` whenever behaviour, commands, file formats, or structure change, and always before a
   commit.
4. **No AI attribution, ever.** Commit messages must not contain `Co-Authored-By` trailers for AI
   tools, "Generated with" lines, or any similar credit. The `commit-msg` hook in `.githooks/`
   rejects them; never bypass it with `--no-verify`.
5. **Professional English everywhere.** File and folder names, identifiers, comments, commit
   messages, and documentation are written in clear, professional English. Song titles and lyrics
   keep their original language.

## Git conventions

- Branch: `main`. Remote: `origin` (`https://github.com/pisondev/musical-score-assistant.git`).
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`,
  `refactor:`), written in the imperative mood.
- Hooks are enabled with `git config core.hooksPath .githooks`; `npm install` does this
  automatically.

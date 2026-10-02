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

## Project guide

A static web app that displays and plays numbered-notation piano scores with a choice of
left-hand arrangements. The app never generates music: songs and arrangements are files under
`songs/`, written in the editor.

- Overview and commands: `README.md`
- File formats (`song.txt`, `arrangements.json`, left-hand notation): `docs/song-format.md`
- Code structure: `docs/architecture.md`
- Purpose, workflow, and planned work: `docs/roadmap.md`
- Adding a song from a photo of a score: the `new-song` skill in `.claude/skills/new-song/`

Things to keep in mind:

- `src/core` must stay free of browser and React code; the checker and the tests run it in Node.
- `songs/private/` is git-ignored. Copyrighted songs and scans of scores go there and are never
  committed, because the repository is public.
- **Fill the gaps.** This is the player's first criterion for every arrangement. Wherever the
  melody holds a long note or rests, the left hand must keep the beat audible and, from the
  intermediate level on, play a fill that suits the style and leads into the next phrase. A
  static arpeggio through those places is what the tool exists to replace: the congregation
  loses the beat. Use a different fill in each gap.
- **Right-hand parts are written per arrangement.** Every arrangement, the baseline included,
  gets a _Melody + fills_ part and an _Accompaniment_ part that agree with its chords and share
  the gaps with its left hand. The player chooses the mode freely; the notes are paired on
  purpose. Fills never change a printed melody note.
- **Write for a 61-key keyboard** (C2 to C7), not a full piano: no left-hand note below C2.
- **Every song names its hymnal.** The header carries `book:` (`KK`, `PKJ`, `KJ`, `KPJ`) and
  `number:`, and the folder is named `<book>-<number>-<title>` in lower case.
- After writing or changing any song file, run `npm run check -- <folder> --dump` and resolve every
  error and warning before handing the song over.
- The player this tool serves reads numbered notation, plays as a hobby, and has so far used one
  pattern everywhere: root, fifth, octave (`1 5 1'` in three-four, `1 5 1' 5` in four-four).
  Suggestions should be playable after a short practice session and explain what is new.

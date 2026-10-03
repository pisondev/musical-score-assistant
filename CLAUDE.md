# Project rules

These rules apply to every change in this repository.

1. **Commit and push only on explicit request.** Never run `git commit` or `git push` unless the
   user asks for it in so many words. Permission given for one task does not carry over to the next.
   A push to `main` deploys the public site through GitHub Actions.
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

A web app that displays and plays numbered-notation piano scores with a choice of left-hand
arrangements, public at https://music-assistant.tierratie.com. The app never generates music:
songs and arrangements are files under `songs/`, written in the editor. A small server in
`server/` signs anybody in with Google, keeps the users in a SQLite database, hands the
licensed songs to the owner only, and keeps the owner's notes.

- Overview and commands: `README.md`
- File formats (`song.txt`, `analysis.md`, `arrangements.json`, `notes.json`, left-hand
  notation): `docs/song-format.md`
- Code structure: `docs/architecture.md`
- The server, the domain, and deploying: `docs/deployment.md`
- Purpose, workflow, and planned work: `docs/roadmap.md`
- Adding a song from a photo of a score: the `new-song` skill in `.claude/skills/new-song/`

Things to keep in mind:

- `src/core` must stay free of browser and React code; the checker, the tests, the server, and
  the Vite configuration run it in Node. Its modules name the files they import (`./types.ts`).
- `songs/private/` is git-ignored. Copyrighted songs and scans of scores go there and are never
  committed, because the repository is public. They must never reach the built site either:
  the library leaves them out of the bundle, and only the server hands them to the signed-in
  owner. `npm run deploy` refuses a build that contains one.
- **Deploy only when asked.** `npm run deploy`, `npm run songs:push`, and a push to `main`
  change the public site; run them only when the user asks for it, like a commit. Changes on the
  server itself (HestiaCP, nginx, Docker) and in the R2 bucket need the same explicit request.
- **Fill the gaps.** This is the player's first criterion for every arrangement. Wherever the
  melody holds a long note or rests, the left hand must keep the beat audible and, from the
  intermediate level on, play a fill that suits the style and leads into the next phrase. A
  static arpeggio through those places is what the tool exists to replace: the congregation
  loses the beat. Use a different fill in each gap.
- **Read the song before arranging it.** Before any arrangement, introduction, or ending is
  written or revised, read all verses of the text and the whole tune, and write the reading
  down as `analysis.md` in the folder of the song: what the text says, how the tune and the
  harmony move, the mood to build, where the climax is, and what follows for the dynamics,
  the fills, and each style. The arrangements follow that reading. A song without
  `analysis.md` gets one before its arrangements are touched.
- **Quality before quantity.** A new song gets five left-hand arrangements, written in the
  order of the player's liking: `alberti-bass`, `gospel`, `jazz` (shell voicings), then
  `new-chords` and `majestic`. The first three are the favourites and get the most care.
  `one-step-further` and `walking-bass` are no longer written; songs that have them keep them.
- **Right-hand parts are written per arrangement.** Every arrangement, the baseline included,
  gets the chords under the melody (`harmony`), a _Melody + fills_ part, and an _Accompaniment_
  part that agree with its chords and share the gaps with its left hand. The player chooses
  the mode freely; the notes are paired on purpose. Chords and fills never change a printed
  melody note.
- **Every song gets its surroundings.** Besides the introductions, write a bridge after the
  last phrase, a key lift for the repeat in a higher key, and five endings in different styles.
  A fill must connect to what follows: end it on a note of the next chord, or let it land on
  the next downbeat.
- **Write for a 61-key keyboard** (C2 to C7), not a full piano: no left-hand note below C2.
- **Every song names its place in the library.** A hymnal song carries `book:` (`KK`, `PKJ`,
  `KJ`, `KPJ`) and `number:`, is listed under Christian with its hymnal as the subcategory,
  and its folder is named `<book>-<number>-<title>` in lower case. Any other song carries
  `category:` (`christian`, `classical`, `traditional`, `other`) and, where it helps,
  `subcategory:` (the composer's surname for classical music).
- **Licensing decides who sees a song.** Hymnal songs are licensed: they live under
  `songs/private/` and are shown to the owner's account only, never to other users. The public
  library holds only songs whose melody and text are both in the public domain (in Indonesia,
  the author died more than 70 years ago). Users choose songs; they never add them.
- **Read the player's notes before revising a song.** The player writes notes on measures in
  the app, mostly on the public site, which keeps them in the R2 bucket. Run
  `npm run notes:pull` first; it copies them into `notes.json` in the folder of the song (git-ignored, format in
  `docs/song-format.md`). Each note names the measure and the arrangement it was written
  about. Act on them, say which notes were handled and how, and leave the file itself to the
  player: do not delete or rewrite notes unless asked.
- After writing or changing any song file, run `npm run check -- <folder> --dump` and resolve every
  error and warning before handing the song over.
- The player this tool serves reads numbered notation, plays as a hobby, and has so far used one
  pattern everywhere: root, fifth, octave (`1 5 1'` in three-four, `1 5 1' 5` in four-four).
  Suggestions should be playable after a short practice session and explain what is new.

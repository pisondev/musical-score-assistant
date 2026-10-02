# Musical Score Assistant

A personal practice tool for pianists who read numbered notation (_not angka_). It shows a song as
a two-row numbered score, offers several left-hand arrangements to choose from, and plays them
back so each idea can be heard before it is practised.

![The score of Amazing Grace with the walking-bass arrangement during playback](docs/images/screenshot.png)

## What it does

- **Numbered score for both hands.** The melody is on the upper row and the left hand on the
  lower row, aligned beat for beat, with chords above and lyrics below the melody. Notes that are
  struck together are written one above the other.
- **Left-hand arrangements to compare.** Every song starts with _My style_, a plain
  root-fifth-octave pattern on the printed chords. Further arrangements vary the pattern, walk the
  bass through inversions, or replace chords, and each change comes with a short explanation.
- **Playback that follows the page.** Play both hands, the right hand alone to check the melody,
  or the left hand alone to hear a suggestion. The note being played is highlighted on the score.
- **Practice controls.** Tempo, metronome with a count-in, looping a range of measures, and
  switching arrangements or hands while the music keeps playing.

The web app only displays and plays. Songs and arrangements are plain files in `songs/`, written
outside the app (see [Adding a song](#adding-a-song)).

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Getting started

```bash
npm install
npm run dev
```

Open the address that Vite prints (by default <http://localhost:5173>). `npm install` also points
git at the versioned hooks in `.githooks/`.

## Using the app

| Action                    | Mouse                  | Keyboard                     |
| ------------------------- | ---------------------- | ---------------------------- |
| Play or pause             | Round button           | `Space`                      |
| Stop and return to start  | Square button          | `Home`                       |
| Both hands / right / left | Segmented control      | `1` `2` `3`                  |
| Move the playhead         | Click a measure        | `Enter` on a focused measure |
| Change arrangement        | Cards above the score  |                              |
| Reset the tempo           | Click the tempo number |                              |

A dot next to a measure number means the selected arrangement explains that measure in the side
panel. Chords on a light-blue background differ from the printed score.

## Adding a song

1. Create a folder under `songs/` (or under `songs/private/` for copyrighted material).
2. Write `song.txt`: header, melody, chords, lyrics.
3. Optionally write `arrangements.json` with left-hand arrangements.
4. Run `npm run check` and fix what it reports.

The formats are described in [docs/song-format.md](docs/song-format.md). With the development
server running, the app reloads as soon as a file changes.

`songs/private/` is git-ignored. Keep copyrighted songs and scans of printed scores there so they
never leave your machine. Note that `npm run build` bundles every song it finds, private ones
included, so publish a build only if it contains songs you are allowed to share.

## Commands

| Command             | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Start the development server                                 |
| `npm run build`     | Type-check and build the static site into `dist/`            |
| `npm run preview`   | Serve the built site locally                                 |
| `npm run check`     | Check every song under `songs/`; add `-- --dump` for details |
| `npm test`          | Run the unit tests                                           |
| `npm run lint`      | Lint the source with ESLint                                  |
| `npm run typecheck` | Type-check the project                                       |
| `npm run format`    | Format the source with Prettier                              |
| `npm run verify`    | Lint, type-check, test, check songs, and build               |

## Project structure

```
songs/              song folders (song.txt, arrangements.json)
src/core/           music engine: parsing, chords, arrangements, validation (no browser code)
src/audio/          playback engine built on Tone.js
src/store/          player state
src/ui/             React components for the score and the controls
scripts/            command-line tools
tests/              unit tests
docs/               format reference, architecture, roadmap
public/samples/     piano samples
```

More detail is in [docs/architecture.md](docs/architecture.md). Planned work is listed in
[docs/roadmap.md](docs/roadmap.md).

## Contributing

Repository rules live in [CLAUDE.md](CLAUDE.md). In short: commits follow Conventional Commits,
are written in English, and must not carry AI attribution; a `commit-msg` hook enforces the last
point. Run `npm run verify` before committing.

## Credits

- Piano sound: [Salamander Grand Piano V3](https://sfzinstruments.github.io/pianos/salamander/) by
  Alexander Holm, licensed under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). See
  [public/samples/piano/README.md](public/samples/piano/README.md).
- Audio scheduling: [Tone.js](https://tonejs.github.io/).
- Demo song: "Amazing Grace" (John Newton, 1779; tune "New Britain"), public domain.

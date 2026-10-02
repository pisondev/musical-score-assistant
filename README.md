# Musical Score Assistant

A personal practice tool for pianists who read numbered notation (_not angka_). It shows a song as
a two-row numbered score, offers several left-hand arrangements to choose from, and plays them
back so each idea can be heard before it is practised.

![The score of Amazing Grace with an improvised introduction and a gospel left hand during playback](docs/images/screenshot.png)

![The same score in staff notation](docs/images/staff-notation.png)

![An accompaniment for singers: the sung melody as a small row above the right hand](docs/images/accompaniment.png)

## What it does

- **Numbered score for both hands.** The melody is on the upper row and the left hand on the
  lower row, aligned beat for beat, with chords above, lyrics below the melody, and dynamics
  between the hands. Notes that are struck together are written one above the other.
- **Left-hand arrangements by level and style.** Every song starts with _My style_, a plain
  root-fifth-octave pattern on the printed chords. Further arrangements are grouped as easy,
  intermediate, and advanced, and each teaches a style: ballad, hymn, classical, gospel,
  majestic, jazz. A guide explains the new patterns and every changed measure.
- **Three roles for the right hand.** _Melody_ plays the printed tune. _Melody + fills_ keeps
  every printed note and adds fills where the tune waits. _Accompaniment_ leaves the tune to
  the singers and plays chords, rhythm, and fills instead; the sung melody stays on the sheet
  as a small row and can be played as a soft guide. Fills and accompaniment are written for
  each left hand, so they agree with its chords and share the gaps with its fills.
- **An introduction.** An optional intro plays before the song: the last phrase of the song, or
  one of several newly written ones in different styles. It has its own block at the top of the
  sheet.
- **Fills where the melody waits.** Every arrangement fills the long notes and rests of the
  melody with a figure that keeps the beat audible and leads into the next phrase.
- **Numbers or staff.** One switch turns the numbered score into staff notation on a grand
  staff, with the same playhead, chords, lyrics, and dynamics.
- **Transposition.** Move the song up or down by half steps. The digits stay the same; the key,
  the chord symbols, and the sound change.
- **Dynamics.** Marks from _pp_ to _ff_ and crescendo or diminuendo hairpins are shown on the
  sheet and shape the loudness of the playback.
- **Playback that follows the page.** Play both hands, the right hand alone to check the melody,
  or the left hand alone to hear a suggestion, with or without the voice guide. The note being
  played is highlighted on the score.
- **Practice controls.** Tempo, metronome with a count-in, looping a range of measures, and
  switching arrangements, keys, or hands while the music keeps playing.
- **Print or save as PDF.** The sheet is laid out for A4 paper with the current arrangement,
  key, and introduction.
- **MIDI and MP3 download.** The same performance as a file: introduction, both hands as
  chosen, key, and dynamics as on the sheet, at the tempo of the slider. MIDI holds the notes,
  one track per hand and one for the voice guide; MP3 is a recording with the sounds of the app.

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

The toolbar above the sheet decides what is shown; the bar at the bottom controls playback.

| Control           | What it does                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **Left hand**     | Opens the arrangements, grouped by level, each tagged with its style                                          |
| **Right hand**    | Melody, _Melody + fills_, or _Accompaniment_, written to go with the selected left hand                       |
| **Intro**         | Off, _Last phrase_, or a written intro; when on, playback starts with the intro                               |
| **Key**           | Transposes by half steps; click the key to return to the original                                             |
| **Show**          | Shows or hides lyrics and dynamics                                                                            |
| **1 2 3 / Staff** | Switches between numbered notation and staff notation                                                         |
| **Guide**         | Opens the panel that explains the arrangement: patterns, tips, measure notes                                  |
| **Print / PDF**   | Opens the print dialog; choose "Save as PDF" as the destination for a file                                    |
| **Download**      | Saves what is on the sheet as MIDI (`.mid`) or MP3, at the current tempo, with what is switched on in the bar |

| Playback action           | Mouse                  | Keyboard                     |
| ------------------------- | ---------------------- | ---------------------------- |
| Play or pause             | Round button           | `Space`                      |
| Stop and return to start  | Square button          | `Home`                       |
| Both hands / right / left | Segmented control      | `1` `2` `3`                  |
| Voice guide on or off     | **Voice** button       | `V`                          |
| Move the playhead         | Click a measure        | `Enter` on a focused measure |
| Reset the tempo           | Click the tempo number |                              |

A dot next to a measure number means the guide explains that measure. Chords on a light-blue
background differ from the printed score. The **Voice** button appears while the right hand
accompanies; the row marked V is what the singers sing. The intro, the right-hand mode, and the
visible rows are remembered between visits.

## Adding a song

1. Create a folder under `songs/` (or under `songs/private/` for copyrighted material).
2. Write `song.txt`: header, melody, chords, lyrics, dynamics.
3. Optionally write `arrangements.json` with left-hand arrangements, the right-hand parts
   that go with them, and introductions.
4. Run `npm run check` and fix what it reports.

Arrangements are written for a 61-key keyboard (C2 to C7), so the left hand never goes below C2.

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
- Staff-notation engraving: [Verovio](https://www.verovio.org/) (LGPL-3.0).
- MP3 encoding: [lamejs](https://github.com/gideonstele/lamejs) (LGPL-3.0).
- Demo song: "Amazing Grace" (John Newton, 1779; tune "New Britain"), public domain.

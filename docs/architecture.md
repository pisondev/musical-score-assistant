# Architecture

The app is a static site. There is no server and no database: songs are files in the repository,
parsed in the browser.

```
songs/<song>/song.txt ──────────┐
songs/<song>/arrangements.json ─┤
                                ▼
                    createSongBundle()                      src/core
                                │
        Song, Arrangement[], introductions, Issue[]
                                │
        selected arrangement + intro choice + transposition
                                ▼
                     buildPerformance()                     src/core
                                │
              Performance { song, arrangement }
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
       <Sheet>          buildNoteEvents()      buildSlotSpans()
      src/ui                    │                     │
                                ▼                     ▼
                         PlaybackEngine          usePlayhead()
                          src/audio          (highlights the score)
```

One model drives both the page and the sound. The score and the audio are derived from the same
`Performance`, so what is highlighted is always what is heard.

## Modules

### `src/core`: the music engine

Pure TypeScript with no browser or React dependencies, so it runs unchanged in the unit tests and
in the command-line checker.

| File             | Responsibility                                                               |
| ---------------- | ---------------------------------------------------------------------------- |
| `types.ts`       | Domain types: `Song`, `Measure`, `Slot`, `Arrangement`, `NoteEvent`, `Issue` |
| `time.ts`        | Tick arithmetic (480 ticks per quarter note)                                 |
| `notes.ts`       | Note names, pitch classes, and spelling a pitch as a scale degree            |
| `chord.ts`       | Chord-symbol parsing, extensions, chord degrees, and transposing symbols     |
| `notation.ts`    | Tokenizer and layout for one line of numbered notation                       |
| `song.ts`        | `song.txt` parser: header, measures, lyrics, dynamics, pickup detection      |
| `left-hand.ts`   | Resolves chord-relative left-hand notation to pitches                        |
| `arrangement.ts` | Builds the baseline and the stored arrangements                              |
| `intro.ts`       | Builds the written introduction and locates the last phrase                  |
| `dynamics.ts`    | Dynamic levels and hairpins on one timeline; loudness at any tick            |
| `transpose.ts`   | Moves a song and an arrangement to another key                               |
| `performance.ts` | Combines song, arrangement, introduction, and transposition                  |
| `validate.ts`    | Playability and harmony checks                                               |
| `playback.ts`    | Converts a performance to timed note events                                  |
| `bundle.ts`      | Reads `arrangements.json` and assembles everything for one song              |

Key ideas:

- **Slots.** A measure is a list of slots: a note (or a stack of notes), a rest, or a hold dot.
  Each slot knows its start and duration in ticks, the beat it belongs to, and how many beams it
  carries. The sheet draws slots as written; playback merges hold dots into the notes they extend.
- **Two reference octaves.** The melody row and the left-hand row each have their own "1". The
  melody's is chosen to sit around the middle of the keyboard; the left hand's is the tonic
  between C2 and B2. This keeps octave dots rare on both rows.
- **Chord-relative left hand.** Arrangements store the left hand as chord degrees (`1 5 1'`), so a
  pattern reads the same on every chord. The engine resolves the degrees to pitches and spells
  them in the key for display.
- **A performance is a song.** `buildPerformance` returns an ordinary `Song` and `Arrangement`
  whose measures start with the introduction, if one is selected, and whose pitches and chord
  symbols are already transposed. Everything downstream (sheet, audio, playhead, loop) works on
  that result and needs no special cases. Introduction measures carry `part: 'intro'` and slot
  ids of their own.
- **Transposition keeps the digits.** Numbered notation is relative to "1", so transposing
  changes pitches, chord symbols, and the key, and leaves every written tone as it is.
- **Dynamics are a timeline.** Level marks and hairpins from all measures form one timeline.
  `gainAt(tick)` gives the loudness factor that scales note velocities; `hairpins()` gives the
  spans that the sheet draws.
- **Issues, not exceptions.** Parsing never throws on bad input. Problems are collected as issues
  with a severity, a measure, and a source position, and the rest of the song still renders.

### `src/audio`: playback

`PlaybackEngine` wraps Tone.js. It is loaded on first use, together with the piano samples, to
keep the first page view light.

- Each hand has its own sampler and channel, sharing one set of decoded sample buffers. Switching
  between both hands, right, and left only mutes a channel, so it is instant and never interrupts
  playback.
- Notes are scheduled on the Tone.js transport in ticks. Tempo changes therefore take effect
  immediately, and replacing the notes while the transport runs (a new left hand or key) keeps
  the position.
- Left-hand notes ring until the next chord symbol or the end of the measure, which imitates a
  sustain pedal changed on every chord.
- The metronome is a repeating transport event; the count-in is scheduled on the audio clock
  before the transport starts.

### `src/store`: state

Two small Zustand stores:

- `player.ts` holds what the playback controls show (status, hand mode, tempo, metronome, loop,
  current measure) and forwards every change to the engine. When new music is loaded it is told
  how much changed: nothing structural (keep the playhead), the measures (rewind), or the song
  (rewind and restore the tempo).
- `settings.ts` holds display preferences (introduction, visible rows, guide) and persists them
  in the browser.

The selected arrangement and the transposition live in `App` and reset when the song changes.

### `src/ui`: the interface

| Component         | Responsibility                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| `Toolbar`         | Left-hand menu by level, intro menu, transposition, visible rows, print |
| `Popover`         | Generic drop-down panel used by the toolbar                             |
| `Sheet`           | The score: introduction and song sections, systems, measures, rows      |
| `sheet-layout.ts` | Measure widths and system breaks                                        |
| `usePlayhead`     | Follows the audio clock and highlights the slots being played           |
| `Guide`           | New patterns, practice tips, and per-measure explanations               |
| `TransportBar`    | Play, stop, hand mode, tempo, metronome, loop                           |
| `SongHeader`      | Title, key, time signature, tempo; credits and legend on request        |
| `IssueList`       | Errors and warnings for the song and the selected arrangement           |

Layout notes:

- Symbols are positioned along a measure by time, as a percentage of the measure length, so the
  two hands always line up.
- Measure widths are weighted by how densely each beat is subdivided, taking every arrangement
  into account. The layout therefore does not shift when the arrangement changes.
- The introduction and the song are laid out as separate runs of systems, so the song always
  starts on a new system.
- The playhead toggles a CSS class directly on the slot elements instead of re-rendering React
  components on every animation frame.
- Printing: on `beforeprint` the sheet switches to a fixed paper width with smaller symbols, so
  four measures fit across an A4 page; `afterprint` restores the screen layout. Print styles hide
  the controls. Saving as PDF is the browser's print-to-PDF.

### `src/library.ts`

Collects every `songs/**/song.txt` and its `arrangements.json` at build time through Vite's
`import.meta.glob`. With the development server running, editing a song file reloads the page.

### `scripts/check-songs.ts`

Runs the same engine from the command line and prints the issues for every song, arrangement,
and written introduction. It is the quickest way to verify a transcription or an arrangement
before opening the app.

## Testing

`npm test` runs the Vitest suite in `tests/`:

- notation, chord, and song parsing;
- left-hand resolution, the baseline, validation, and playback events;
- dynamics, transposition, introductions, and chord extensions;
- sheet layout;
- every committed song must load without errors or warnings.

The audio engine and the React components are thin layers over the tested core and are verified
by running the app.

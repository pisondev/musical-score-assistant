# Architecture

The app is a static site. There is no server and no database: songs are files in the repository,
parsed in the browser.

```
songs/<song>/song.txt ──────────┐
songs/<song>/arrangements.json ─┤
                                ▼
                    createSongBundle()                 src/core
                                │
          ┌─────────────────────┼──────────────────────┐
          ▼                     ▼                      ▼
   Song (melody,         Arrangement[]           Issue[] (errors
   chords, lyrics)       (baseline first)        and warnings)
          │                     │
          ├──────────┬──────────┤
          ▼          ▼          ▼
     <Sheet>   buildNoteEvents()   buildSlotSpans()
    src/ui           │                  │
                     ▼                  ▼
              PlaybackEngine       usePlayhead()
               src/audio        (highlights the score)
```

One model drives both the page and the sound. The score and the audio are derived from the same
`Song` and `Arrangement` objects, so what is highlighted is always what is heard.

## Modules

### `src/core`: the music engine

Pure TypeScript with no browser or React dependencies, so it runs unchanged in the unit tests and
in the command-line checker.

| File             | Responsibility                                                               |
| ---------------- | ---------------------------------------------------------------------------- |
| `types.ts`       | Domain types: `Song`, `Measure`, `Slot`, `Arrangement`, `NoteEvent`, `Issue` |
| `time.ts`        | Tick arithmetic (480 ticks per quarter note)                                 |
| `notes.ts`       | Note names, pitch classes, and spelling a pitch as a scale degree            |
| `chord.ts`       | Chord-symbol parsing and chord degrees                                       |
| `notation.ts`    | Tokenizer and layout for one line of numbered notation                       |
| `song.ts`        | `song.txt` parser: header, measures, lyrics, pickup detection                |
| `left-hand.ts`   | Resolves chord-relative left-hand notation to pitches                        |
| `arrangement.ts` | Builds the baseline and the stored arrangements                              |
| `validate.ts`    | Playability and harmony checks                                               |
| `playback.ts`    | Converts a song and an arrangement to timed note events                      |
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
- **Issues, not exceptions.** Parsing never throws on bad input. Problems are collected as issues
  with a severity, a measure, and a source position, and the rest of the song still renders.

### `src/audio`: playback

`PlaybackEngine` wraps Tone.js. It is loaded on first use, together with the piano samples, to
keep the first page view light.

- Each hand has its own sampler and channel, sharing one set of decoded sample buffers. Switching
  between both hands, right, and left only mutes a channel, so it is instant and never interrupts
  playback.
- Notes are scheduled on the Tone.js transport in ticks. Tempo changes therefore take effect
  immediately, and replacing the left-hand part while the transport runs keeps the position.
- Left-hand notes ring until the next chord symbol or the end of the measure, which imitates a
  sustain pedal changed on every chord.
- The metronome is a repeating transport event; the count-in is scheduled on the audio clock
  before the transport starts.

### `src/store`: player state

A small Zustand store holds what the controls show (status, hand mode, tempo, metronome, loop,
current measure) and forwards every change to the engine.

### `src/ui`: the interface

| Component           | Responsibility                                                |
| ------------------- | ------------------------------------------------------------- |
| `Sheet`             | The score: systems, measures, chords, both staff rows, lyrics |
| `sheet-layout.ts`   | Measure widths and system breaks                              |
| `usePlayhead`       | Follows the audio clock and highlights the slots being played |
| `ArrangementPicker` | Switches between the baseline and the stored arrangements     |
| `Insights`          | New patterns, practice tips, and per-measure explanations     |
| `TransportBar`      | Play, stop, hand mode, tempo, metronome, loop                 |
| `SongHeader`        | Title, credits, key, time signature, tempo                    |
| `IssueList`         | Errors and warnings for the song and the selected arrangement |

Layout notes:

- Symbols are positioned along a measure by time, as a percentage of the measure length, so the
  two hands always line up.
- Measure widths are weighted by how densely each beat is subdivided, taking every arrangement
  into account. The layout therefore does not shift when the arrangement changes.
- The playhead toggles a CSS class directly on the slot elements instead of re-rendering React
  components on every animation frame.

### `src/library.ts`

Collects every `songs/**/song.txt` and its `arrangements.json` at build time through Vite's
`import.meta.glob`. With the development server running, editing a song file reloads the page.

### `scripts/check-songs.ts`

Runs the same engine from the command line and prints the issues for every song. It is the
quickest way to verify a transcription or an arrangement before opening the app.

## Testing

`npm test` runs the Vitest suite in `tests/`:

- notation, chord, and song parsing;
- left-hand resolution, the baseline, validation, and playback events;
- sheet layout;
- every committed song must load without errors or warnings.

The audio engine and the React components are thin layers over the tested core and are verified
by running the app.

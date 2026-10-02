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
   selected arrangement + right-hand mode + intro choice + transposition
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
| `right-hand.ts`  | Builds the right-hand parts of an arrangement and puts one in place          |
| `time.ts`        | Tick arithmetic (480 ticks per quarter note)                                 |
| `notes.ts`       | Note names, pitch classes, and spelling a pitch as a scale degree            |
| `chord.ts`       | Chord-symbol parsing, extensions, chord degrees, and transposing symbols     |
| `notation.ts`    | Tokenizer and layout for one line of numbered notation                       |
| `song.ts`        | `song.txt` parser: header, measures, lyrics, dynamics, pickup detection      |
| `hymnals.ts`     | The hymnals the library knows by name, and how a song is cited ("PKJ 184")   |
| `left-hand.ts`   | Resolves chord-relative left-hand notation to pitches                        |
| `arrangement.ts` | Builds the baseline and the stored arrangements                              |
| `intro.ts`       | Locates the last phrase of a song                                            |
| `passage.ts`     | Builds written passages: introductions, the bridge, the key lift, endings    |
| `dynamics.ts`    | Dynamic levels and hairpins on one timeline; loudness at any tick            |
| `gaps.ts`        | Finds the places where the melody waits and the left hand must fill          |
| `keyboard.ts`    | Range of the target instrument, a 61-key keyboard                            |
| `staff.ts`       | Staff notation for a row of slots: note values, ties, beams, accidentals     |
| `mei.ts`         | Serializes a performance as MEI for the staff-notation engraver              |
| `midi.ts`        | Writes a performance as a Standard MIDI File                                 |
| `transpose.ts`   | Moves a song and an arrangement to another key                               |
| `performance.ts` | Assembles what is played: intro, song, repeat, ending, key, right-hand part  |
| `summary.ts`     | Counts what a song offers, for the cards on the home page                    |
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
  with everything that is played in one row of measures, pitches and chord symbols already
  transposed: the introduction, the song, with **Repeat** an interlude and the song once more
  in the lifted key, and the ending. Everything downstream (audio, playhead, loop, MIDI) works
  on that result and needs no special cases. Each measure says which stretch it belongs to
  (`part`: intro, song, interlude, ending) and every slot has an id of its own, also the
  second time through.
- **Sections say where the blocks are.** `Performance.sections` lists the stretches in order,
  each with a title, its first measure, its length, and its key. The sheet draws one block per
  section, the staff view engraves each with its own key signature, the MIDI writer puts a
  key signature where the key changes, and `measureNames` derives every label from them
  ("Intro 2", "m. 5 (repeat)", "Ending 1").
- **Passages are written once and placed by the form.** `buildPassage` builds introductions,
  the bridge, the key lift, and endings from the same two-hand notation. The key lift is
  written in the key of the song and simply transposed with the repeat. A measure that was
  cut short for the pickup is completed with holds wherever something other than the pickup
  follows, so no passage has to know what comes before it.
- **A right-hand part extends measures, not the model.** Each arrangement carries the fills
  and the accompaniment written for it, and `applyRightHand` puts one into the song's measures
  (and replaces the left hand of a measure, where the part says so), so everything downstream
  still sees a plain song and arrangement. Fills leave the melody slots untouched and add
  `Measure.fills`, a second voice with the notes that are new; it is derived from the part by
  removing the melody notes, so a long melody note keeps its printed length while the fill
  plays. An accompaniment takes the place of the melody, which moves to `Measure.voice`: a
  line that the sheet shows, the playhead follows, and the engine plays as its own track. The introduction is built from the unchanged song, so it keeps
  the tune in every mode.
- **Pedal, without a pedal.** `buildNoteEvents` lets left-hand notes ring until the harmony
  changes, and the last notes of a right-hand fill until the right hand plays again (or until
  a chord arrives that they do not belong to). The sheet shows the written lengths; only the
  sound is longer.
- **Transposition keeps the digits.** Numbered notation is relative to "1", so transposing
  changes pitches, chord symbols, and the key, and leaves every written tone as it is.
- **Dynamics are a timeline.** Level marks and hairpins from all measures form one timeline.
  `decibelsAt(tick)` gives the loudness relative to mezzo-forte, `velocityFactorAt(tick)` the
  factor that scales note velocities to reach it, and `hairpins()` the spans that the sheet
  draws.
- **A velocity means the same everywhere.** Loudness follows the square of the velocity, the
  curve of MIDI instruments (`velocityToGain`). The audio engine applies that curve before it
  triggers a note, and the MIDI writer stores the velocity as it is, so the app, the MP3, and a
  MIDI file played by another instrument keep the same distance between soft and loud.
- **Issues, not exceptions.** Parsing never throws on bad input. Problems are collected as issues
  with a severity, a measure, and a source position, and the rest of the song still renders.

### `src/audio`: playback

`PlaybackEngine` wraps Tone.js. It is loaded on first use, together with the piano samples, to
keep the first page view light.

- Each hand has its own sampler and channel, sharing one set of decoded sample buffers. Switching
  between both hands, right, and left only mutes a channel, so it is instant and never interrupts
  playback.
- A third track, the voice, plays the sung melody while the right hand accompanies. It uses a
  plain synthesized tone instead of the piano, so the guide and the accompaniment can be told
  apart, and has a channel of its own that the **Voice** button mutes.
- Notes are scheduled on the Tone.js transport in ticks. Tempo changes therefore take effect
  immediately, and replacing the notes while the transport runs (a new left hand or key) keeps
  the position.
- Left-hand notes ring until the next chord symbol or the end of the measure, which imitates a
  sustain pedal changed on every chord.
- The metronome is a repeating transport event; the count-in is scheduled on the audio clock
  before the transport starts.
- `render()` plays the same note events into an offline audio context, which runs faster than
  real time and returns the audio as a buffer. `mp3.ts` raises it to a normal listening level
  and encodes it with an MP3 encoder that is loaded on demand, in slices so the page stays
  responsive.

### `src/store`: state

Three small Zustand stores:

- `player.ts` holds what the playback controls show (status, hand mode, tempo, metronome, loop,
  current measure) and forwards every change to the engine. When new music is loaded it is told
  how much changed: nothing structural (keep the playhead), the measures (rewind), or the song
  (rewind and restore the tempo).
- `settings.ts` holds display preferences (introduction, right-hand mode, visible rows, guide)
  and persists them in the browser.
- `history.ts` holds what the home page needs: when each song was last opened and with which
  left hand, and the favourites. It is persisted as well.

The selected arrangement and the transposition live in `SongPage`. The page is mounted afresh
for every song, starting from the left hand remembered for it.

### `src/ui`: the interface

| Component         | Responsibility                                                           |
| ----------------- | ------------------------------------------------------------------------ |
| `App`             | The shell: top bar, and the home page or one song, chosen by the address |
| `Home`            | Totals, the song to continue, search, sorting, and the songs by hymnal   |
| `library-view.ts` | Which songs the home page lists, in what order, and under which hymnal   |
| `SongPage`        | One song: builds the performance, feeds the engine, handles exports      |
| `Toolbar`         | Menus for both hands and the intro, transposition, visible rows, export  |
| `Popover`         | Panel behind a toolbar button: a drop-down, or a bottom sheet on a phone |
| `Sheet`           | The numbered score: introduction and song sections, systems, measures    |
| `StaffSheet`      | The same score in staff notation, engraved by Verovio as SVG             |
| `useVerovio`      | Loads the engraver on demand                                             |
| `sheet-layout.ts` | Measure widths and system breaks                                         |
| `usePlayhead`     | Follows the audio clock and highlights the slots being played            |
| `Guide`           | New patterns, practice tips, and per-measure explanations                |
| `TransportBar`    | Play, stop, hand mode, tempo, metronome, loop                            |
| `SongHeader`      | Title, key, time signature, tempo; credits and legend on request         |
| `IssueList`       | Errors and warnings for the song and the selected arrangement            |

Navigation uses the address: `#song=<id>` names a song, and an address without one shows the
home page. Song cards are ordinary links, so the Back button, bookmarks, and opening a song in a
new tab work without a router. Leaving a song page stops the playback.

The layout adapts with style sheets alone; the components render the same markup at every
width. Below 900 pixels the playback bar becomes a two-row grid, with the tempo and the toggles
in a wrapper that has no box of its own on wider windows. Below 720 pixels the toolbar turns
into one sticky row that scrolls sideways, and a popover panel is fixed to the bottom edge with
a backdrop behind it. A phone held sideways gets a single-row playback bar. `keep-in-view.ts`
measures the playback bar before it scrolls the measure under the playhead back into sight,
because the height of that bar depends on the window.

Layout notes:

- Symbols are positioned along a measure by time, as a percentage of the measure length, so the
  two hands always line up.
- Measure widths are weighted by how densely each beat is subdivided, taking every arrangement
  and every right-hand part into account. The layout therefore does not shift when either hand
  changes.
- The introduction and the song are laid out as separate runs of systems, so the song always
  starts on a new system.
- The playhead toggles a CSS class directly on the slot elements instead of re-rendering React
  components on every animation frame.
- MIDI download: `midi.ts` writes the same note events the audio engine plays, so the file
  matches what is heard: one conductor track with tempo, meter, and key, one track per hand,
  and one for the voice when it plays. The ticks are the engine's own (480 per quarter note),
  so nothing is rounded.
- Staff notation: `mei.ts` gives every note the id of the slot it stands for and every measure
  the id of its index. Verovio keeps those ids in the SVG, so the playhead, the highlight of the
  current measure, and click-to-seek work exactly as on the numbered sheet. The introduction and
  the song are engraved separately, so each starts on its own system. The voice of an
  accompaniment becomes a staff of its own above the grand staff and carries the lyrics.
- Printing: on `beforeprint` the sheet switches to a fixed paper width with smaller symbols, so
  four measures fit across an A4 page; `afterprint` restores the screen layout. Print styles hide
  the controls. Saving as PDF is the browser's print-to-PDF. Browsers leave background colours
  out when they print, so every mark of the notation (octave dots, beams, accidental strokes,
  holds) is drawn with a border, never with a background.
- Measure widths: positions follow time, so a measure is as wide as its busiest beat needs
  (`measureWeight`), or wider when its syllables or chord symbols would otherwise run into each
  other (`labelRowWidth`). The widths of the text are estimated from the font sizes of
  `sheet.css`; the two have to be kept in step.

### `src/library.ts`

Collects every `songs/**/song.txt` and its `arrangements.json` at build time through Vite's
`import.meta.glob`, and summarizes each song for the home page. With the development server
running, editing a song file reloads the page.

### `scripts/check-songs.ts`

Runs the same engine from the command line and prints the issues for every song, arrangement,
right-hand part, and written passage (introduction, bridge, key lift, ending). It is the
quickest way to verify a transcription or an arrangement before opening the app.

## Testing

`npm test` runs the Vitest suite in `tests/`:

- notation, chord, and song parsing;
- left-hand resolution, the baseline, validation, and playback events;
- dynamics, transposition, introductions, and chord extensions;
- right-hand parts: building, the rules for fills and accompaniments, the voice in the note
  events, the staff notation, and the MIDI file;
- staff notation (note values, ties, beams, accidentals, MEI output, and a render through the
  engraver), gap detection, and the keyboard range;
- the MIDI writer, read back byte by byte;
- sheet layout;
- the home page: song summaries, search, sorting, favourites, and relative dates;
- every committed song must load without errors or warnings.

The audio engine and the React components are thin layers over the tested core and are verified
by running the app.

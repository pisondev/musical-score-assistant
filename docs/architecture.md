# Architecture

The app is a static site. There is no database: songs are files in the repository, parsed in
the browser. The one thing a page cannot do is write a file, so the development server offers
a single endpoint that saves the player's notes into the song folders (see
[`scripts/notes-plugin.ts`](#scriptsnotes-plugints)).

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

| File                | Responsibility                                                               |
| ------------------- | ---------------------------------------------------------------------------- |
| `types.ts`          | Domain types: `Song`, `Measure`, `Slot`, `Arrangement`, `NoteEvent`, `Issue` |
| `right-hand.ts`     | Builds the right-hand parts of an arrangement and puts one in place          |
| `time.ts`           | Tick arithmetic (480 ticks per quarter note)                                 |
| `notes.ts`          | Note names, pitch classes, and spelling a pitch as a scale degree            |
| `chord.ts`          | Chord-symbol parsing, extensions, chord degrees, and transposing symbols     |
| `notation.ts`       | Tokenizer and layout for one line of numbered notation                       |
| `song.ts`           | `song.txt` parser: header, measures, lyrics, dynamics, pickup detection      |
| `hymnals.ts`        | The hymnals the library knows by name, and how a song is cited ("PKJ 184")   |
| `left-hand.ts`      | Resolves chord-relative left-hand notation to pitches                        |
| `arrangement.ts`    | Builds the baseline and the stored arrangements                              |
| `intro.ts`          | Locates the last phrase of a song                                            |
| `passage.ts`        | Builds written passages: introductions, the bridge, the key lift, endings    |
| `dynamics.ts`       | Dynamic levels and hairpins on one timeline; loudness at any tick            |
| `gaps.ts`           | Finds the places where the melody waits and the left hand must fill          |
| `keyboard.ts`       | Range of the target instrument, a 61-key keyboard                            |
| `staff.ts`          | Staff notation for a row of slots: note values, ties, beams, accidentals     |
| `mei.ts`            | Serializes a performance as MEI for the staff-notation engraver              |
| `midi.ts`           | Writes a performance as a Standard MIDI File                                 |
| `transpose.ts`      | Moves a song and an arrangement to another key                               |
| `performance.ts`    | Assembles what is played: intro, song, repeat, ending, key, right-hand part  |
| `summary.ts`        | Counts what a song offers, for the cards on the home page                    |
| `validate.ts`       | Playability and harmony checks                                               |
| `playback.ts`       | Converts a performance to timed note events                                  |
| `bundle.ts`         | Reads `arrangements.json` and assembles everything for one song              |
| `form-stretches.ts` | Divides a performance into its named parts: intro, verse, refrain, ending    |
| `notes-file.ts`     | The player's notes as stored in `notes.json`: reading and sorting them       |
| `measure-notes.ts`  | Where a note belongs in a performance, and what was on the sheet             |

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
- **A right-hand part extends measures, not the model.** Each arrangement carries the chords,
  the fills, and the accompaniment written for it, and `applyRightHand` puts them into the
  song's measures. The chords under the melody come first, in the modes that play the melody:
  a melody slot becomes a stack with the same id, rhythm, and lyric, so nothing downstream
  has to know. Then the mode itself is applied
  (and replaces the left hand of a measure, where the part says so), so everything downstream
  still sees a plain song and arrangement. Fills leave the melody slots untouched and add
  `Measure.fills`, a second voice with the notes that are new; it is derived from the part by
  removing the melody notes, so a long melody note keeps its printed length while the fill
  plays. An accompaniment takes the place of the melody, which moves to `Measure.voice`: a
  line that the sheet shows, the playhead follows, and the engine plays as its own track. The
  last-phrase introduction is built from the tune itself (with its chords, when they are on),
  so it keeps the tune in every mode.
- **Pedal, without a pedal.** `buildNoteEvents` lets left-hand notes ring until the harmony
  changes, and the last notes of a right-hand fill until the right hand plays again (or until
  a chord arrives that they do not belong to). The sheet shows the written lengths; only the
  sound is longer.
- **How a chord is struck.** A slot marked `rolled` stays one symbol on the sheet (with a wavy
  line) and in the written notes the checker reads; `buildNoteEvents` spreads its notes in
  time afterwards, so the audio engine and the MIDI writer need to know nothing about it. The
  notes under the top note of a right-hand chord are played slightly softer than the top.
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
- **A note belongs to a place, not to a position on the sheet.** `noteTarget` turns the index
  of a measure in the performance into what the note is about: a printed measure number in the
  song, or a position within a named introduction or ending. The same note therefore shows in
  the first time through and in the repeat, survives a change of introduction, and stays
  readable outside the app ("Measure 12"). What was on the sheet is stored beside it as
  context, not as part of the place.
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

| Component          | Responsibility                                                            |
| ------------------ | ------------------------------------------------------------------------- |
| `App`              | The shell: top bar, and the home page or one song, chosen by the address  |
| `Home`             | Totals, the song to continue, search, sorting, and the songs by hymnal    |
| `library-view.ts`  | Which songs the home page lists, in what order, and under which hymnal    |
| `SongPage`         | One song: builds the performance, feeds the engine, handles exports       |
| `Toolbar`          | The controls of a song in the top bar: the Options list, notation, export |
| `Popover`          | Panel behind a button: a drop-down, or a bottom sheet on a phone          |
| `Sheet`            | The numbered score: introduction and song sections, systems, measures     |
| `StaffSheet`       | The same score in staff notation, engraved by Verovio as SVG              |
| `useVerovio`       | Loads the engraver on demand                                              |
| `sheet-layout.ts`  | Measure widths and system breaks                                          |
| `usePlayhead`      | Follows the audio clock and highlights the slots being played             |
| `MeasureMenu`      | The menu of one measure: at the pointer, or a bottom sheet on a phone     |
| `useMeasureMenu`   | Opens that menu on a right click or a long press, on either notation      |
| `Dialog`           | The frame of a dialog: centred, or a bottom sheet on a phone              |
| `NoteDialog`       | The notes on one measure: read, write, change, delete                     |
| `DownloadDialog`   | Lists what a file will hold and asks before it is made                    |
| `song-export.ts`   | What a download holds right now: tracks, tempo, length, file name, sizes  |
| `useMeasureNotes`  | Loads and saves the notes of a song: in its folder, or in the browser     |
| `FormProgress`     | The progress bar under the controls: the part of the piece one is in      |
| `view-position.ts` | Which measure the reader is at, from the scroll position; scrolling there |
| `Guide`            | New patterns, practice tips, and per-measure explanations                 |
| `TransportBar`     | Play, stop, hand mode, tempo, metronome, loop                             |
| `SongHeader`       | Title, key, time signature, tempo; credits and legend on request          |
| `IssueList`        | Errors and warnings for the song and the selected arrangement             |

Navigation uses the address: `#song=<id>` names a song, and an address without one shows the
home page. Song cards are ordinary links, so the Back button, bookmarks, and opening a song in a
new tab work without a router. Leaving a song page stops the playback.

The layout adapts with style sheets alone; the components render the same markup at every
width. Below 900 pixels the playback bar becomes a two-row grid, with the tempo and the toggles
in a wrapper that has no box of its own on wider windows. Below 720 pixels a popover panel is
fixed to the bottom edge with a backdrop behind it. A phone held sideways gets a single-row
playback bar. `keep-in-view.ts` measures both bars before it scrolls the measure under the
playhead back into sight, because their heights depend on the window.

The controls of a song live in the top bar, although the state they change lives in
`SongPage`: the shell offers an empty element in the bar and the page renders its `Toolbar`
into it through a portal. When the controls do not fit beside the name of the app and the
menu of songs, they wrap to a second row; the shell publishes the height of the bar as
`--topbar-height`, which keeps the guide below it. On a phone the bar sticks with a negative
offset, so its first row scrolls away and the row of controls stays at the top.

The progress bar is rendered into a second element of the top bar in the same way, so it
sticks with the bar and counts towards `--topbar-height`. `formStretches` divides the
performance into its named parts: the sections of the sheet, with the song divided further
where `song.txt` names a section. While the music plays, the bar shows the measure under the
playhead. Otherwise it shows the place of the reader, which `view-position.ts` derives from
the page: a line that moves from just under the top bar to just above the playback bar as the
page scrolls from its start to its end, so that the first measure is reached at the top of the
page and the last one at the bottom, whatever the height of the window. The measure that line
crosses is the place. It is read from the elements with the id of a measure, which both
notations draw, so the bar needs to know nothing about either. A click on a part asks for the
scroll position that puts the line on its first measure.

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
- Listening to one hand changes nothing but a class on the sheet (`sheet--hear-right`,
  `sheet--hear-left`). The style sheet draws the rows of the other hand pale, and their
  playhead as well; in staff notation it finds those notes by the class that `mei.ts` gives
  every symbol of a track.
- MIDI download: `midi.ts` writes the same note events the audio engine plays, so the file
  matches what is heard: one conductor track with tempo, meter, and key, one track per hand,
  and one for the voice when it plays. The ticks are the engine's own (480 per quarter note),
  so nothing is rounded.
- Sizes before a download: `useExportFacts` follows the playback bar and says what a file
  would hold at this moment. The MIDI file is small and quick to write, so its size is taken
  from the file itself. An MP3 takes seconds to render, so its size is computed instead: the
  encoder runs at a constant bit rate, which makes the size the length of the recording (the
  music plus the tail in which the last notes ring out) times that rate. The download menu and
  the confirmation dialog read the same facts, so they cannot disagree.
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
quickest way to verify a transcription or an arrangement before opening the app. It also
says whether the reading of a song (`analysis.md`) is written and whether the player has left
notes on it, the two things to read before a song is arranged or revised.

### `scripts/notes-plugin.ts`

A Vite plugin for the development and the preview server. It answers `GET` and `PUT` on
`/api/notes?song=<id>` by reading and writing `notes.json` next to the `song.txt` of that song,
which is how notes written in the browser end up as files in the repository folder.

- The id must be the path of a folder that holds a `song.txt`, made of plain names; anything
  else is answered with 404, so the endpoint cannot write outside the song folders.
- Whatever arrives is passed through `readNotes`, which keeps well-formed notes only. The file
  is written in the order of the piece and removed when the last note is deleted.
- The build has no such endpoint. `useMeasureNotes` notices (the answer is not JSON), keeps the
  notes in `localStorage`, and hands them to the endpoint the next time it is there.

The notes are not part of the bundle: the app asks for them when a song is opened, so writing
one never reloads the page.

The plugin is loaded by `vite.config.ts`, so everything it imports becomes part of the
configuration. That is why the file format lives in `notes-file.ts`, a module that depends on
nothing but the types, apart from the rest of the engine, and why that chain of imports names
its files with their extension.

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
- downloads: the length of a performance, the size of a recording, and how sizes and lengths
  are written;
- notes on measures: the place a note refers to, reading a file that was edited by hand, and
  writing, reading back, and removing the file in a temporary folder;
- every committed song must load without errors or warnings.

The audio engine and the React components are thin layers over the tested core and are verified
by running the app.

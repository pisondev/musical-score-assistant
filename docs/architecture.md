# Architecture

The app is a site that runs in the browser, with a small server beside it. Songs are files in
the repository (and, for the licensed ones, in a bucket), parsed in the browser; the people who
sign in are kept by the server in a SQLite database. The server signs anybody in with Google,
hands the licensed songs to the owner, and keeps notes, favourites, recent songs, and settings
(see
[`server/`](#server-the-api-and-the-production-server)). The same API runs inside the
development server, where this computer is the owner. How it is deployed is described in
[deployment.md](deployment.md).

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
| `categories.ts`     | The categories of the library, and where a song is listed in them            |
| `song-index.ts`     | The index entry of a song: what the library needs before the song is opened  |
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
keep the first page view light. The names, folder, and version of the samples live in
`samples.ts`, which the service worker shares to fetch them ahead of time.

- Each hand has its own sampler and channel, sharing one set of decoded sample buffers. Behind
  each channel sits a gain that lets the track through or not. Switching between both hands,
  left, and right only moves those gains, so playback is never interrupted. The gain is not
  switched but faded, over seven hundredths of a second on the way out and four on the way in:
  a note cut off in the middle of its sound makes a click, and a fade this short is still
  heard as immediate.
- A third track, the voice, plays the sung melody while the right hand accompanies. It uses a
  plain synthesized tone instead of the piano, so the guide and the accompaniment can be told
  apart, and has a channel and a gain of its own, which the **Voice** button fades.
- Notes are scheduled on the Tone.js transport in ticks. Tempo changes therefore take effect
  immediately, and replacing the notes while the transport runs (a new left hand or key) keeps
  the position.
- Left-hand notes ring until the next chord symbol or the end of the measure, which imitates a
  sustain pedal changed on every chord.
- The metronome is a repeating transport event; the count-in is scheduled on the audio clock
  before the transport starts.
- A loop is the loop of the transport, made longer by a rest: the range of ticks plus two or
  three beats (`loopRestBeats`). The notes of the music that follows the loop lie inside that
  rest; they stay on the transport, and the callback that plays a note skips those whose tick
  falls in the rest. The event that ends the song is skipped in the same way, so a loop on the
  last measure goes on. `loopRest` says which beat of the rest is being counted. The clock of
  the transport can read past the end of the loop for a moment before it jumps back; the engine
  takes such a reading as the start of the next round, so the playhead never flashes on the
  measure after the loop.
- `render()` plays the same note events into an offline audio context, which runs faster than
  real time and returns the audio as a buffer. `mp3.ts` raises it to a normal listening level
  and encodes it with an MP3 encoder that is loaded on demand, in slices so the page stays
  responsive.

### `src/store`: state

Three small Zustand stores:

- `player.ts` holds what the playback controls show (status, hand mode, tempo, metronome, loop,
  current measure, the beat of a loop's rest) and forwards every change to the engine. When new music is loaded it is told
  how much changed: nothing structural (keep the playhead), the measures (rewind), or the song
  (rewind and restore the tempo).
- `settings.ts` holds display preferences (introduction, right-hand mode, visible rows, guide,
  zoom) and persists them in the browser. The zoom stays with the device; the rest travels
  with the account.
- `history.ts` holds what the home page needs: when each song was last opened and with which
  left hand, and the favourites. It is persisted as well.

Two more modules handle the account:

- `account.ts` asks the server who is signed in (`/api/me`): an owner, a member, a guest, or
  nobody at all when the site is served without the server. It builds the sign-in address,
  which brings the browser back to the same song, and deletes the account on request.
- `account-sync.ts` keeps the settings and the history with the account once someone is
  signed in. It fetches the stored document and merges it with the browser's (the account's
  settings win, favourites are joined, of two visits to a song the later counts), then sends
  the whole document back a moment after every change. The stores themselves know nothing of
  it; the browser stays their first home.

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
| `sheet-layout.ts`  | Measure widths, system breaks, and the scale that fits a phone            |
| `ZoomControl`      | Smaller, the size in percent (a click resets it), larger                  |
| `zoom.ts`          | The steps of the zoom, from 50 to 180 percent                             |
| `useScreenShape`   | Whether the screen is a phone's, and whether it is held sideways          |
| `FullScreenButton` | Gives the whole screen to the app, where the browser can                  |
| `useWakeLock`      | Keeps the screen on while a song page is open                             |
| `InstallCard`      | Offers to install the app, or explains the Share menu of an iPhone        |
| `CommentDialog`    | A member's comments on one measure, where they stand, and the answers     |
| `RepliesCard`      | Tells a member on the home page that the author has answered              |
| `usePlayhead`      | Follows the audio clock and highlights the slots being played             |
| `MeasureMenu`      | The menu of one measure: at the pointer, or a bottom sheet on a phone     |
| `useMeasureMenu`   | Opens that menu on a right click or a long press; a click selects         |
| `MeasureOverlay`   | Something laid over one measure of either notation: corner or centre      |
| `measure-box.ts`   | The box of a measure on the page, and the measure at a point              |
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
| `AccountButton`    | Sign in with Google, or the account with its sign-out, in the top bar     |

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
- Measures of the staff have a box: the engraving draws notes and lines but nothing behind
  them, so the space between the notes belongs to no measure. After every engraving
  `StaffSheet` puts a rectangle behind the notes of each measure, from its top staff to its
  bottom one. The rectangle takes the pointer anywhere in the measure, and the style sheet
  tints it for the same states as on the numbered sheet: under the pointer, under the
  playhead, in a loop. The tints are see-through, because a tie or a hairpin of the measure
  before may reach into the box.
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
- Size on screen: the numbered score is laid out for a width of `measuredWidth / scale` and
  drawn with CSS `zoom: scale` on `.sheet__body`, so a smaller scale means more measures per
  line at the same physical width. On a phone `fitScale` picks the scale at which a typical
  run of measures (`typicalRun`, the 80th percentile of runs of that length) fills the line:
  two upright, four sideways. The zoom of the player multiplies that scale and divides the
  measures allowed per line. `StaffSheet` multiplies the Verovio scale by the zoom instead.
  Printing ignores both.

### `src/styles`: the look

Two style sheets: `app.css` for the interface and `sheet.css` for the score. Colours are
custom properties on `:root`, and components use those, not literals, so the look can be moved
as a whole.

| Token                              | Used for                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| `--primary` (ocean blue)           | What can be pressed and what is selected, links, chord symbols |
| `--sky` (cyan)                     | Loops, tags, hints, the block of an introduction               |
| `--emerald`                        | Section names, hymnal badges, the block of an interlude        |
| `--navy`                           | The dark end: the selected hymnal, headings                    |
| `--right-hand`, `--left-hand`      | Blue and teal: the playhead and the hand control               |
| `--brand`                          | Emerald through cyan to ocean blue, in one sweep               |
| `--warning`, `--danger` and `soft` | Notes of the player, warnings, errors                          |

The colours are one family, from green-blue to dark blue, so nothing clashes; the amber of
the player's notes is the one colour from outside it, because a note has to stand out.

The sweep `--brand` marks what starts or measures something: the mark of the app, the Play
and Continue buttons, the progress bar, and a hairline along the top bar and the playback
bar. Patterns are backgrounds only and change no layout: fine dots and a wash of the three
colours across the top of the page, staff lines across the "continue practising" card, and
fine diagonal stripes in the blocks around the song (introduction, interlude, ending), each
tinted in its own colour. On paper all of it gives way to black on white.

Scrollbars are styled once, for the page and every panel, from `--scroll-thumb`.

### `src/library.ts`: the index and loading a song

The library holds an index entry per song (`SongIndexEntry` in `src/core/song-index.ts`): the
header, the place in the categories, the counts of the summary, and the names of the left
hands. The home page, the search, the song menu, and "continue practising" work from these
entries alone. A song is loaded whole only when it is opened (`loadSong`, `useSongBundle`),
once per visit, so the first page stays small however large the library grows.

- Public songs: `scripts/song-index-plugin.ts` reads every song outside `songs/private` at
  build time, runs the engine on it, and offers the entries as the module
  `virtual:song-index`. The files themselves are imported through a lazy
  `import.meta.glob`, so each song becomes a chunk of its own. The service worker keeps such
  a chunk when the song is first opened, not when the app is installed.
- Private songs are licensed and never part of the build, because the built site can be
  downloaded by anybody. For the owner, `useLibrary` fetches their entries from
  `/api/private-songs`, which the server makes once per change of a song, and a song itself
  from `/api/private-songs?id=<song id>`. A song address that names a private song waits for
  the entries, or asks a guest to sign in.

With the development server running, a change to a public song file rebuilds the index and
reloads the page; for private songs the development API triggers the reload.

Every module of `src/core` names the files it imports (`./types.ts`): the core runs in the
browser, in the tests, in the checker, in the server, and inside the Vite configuration (the
index plugin), and a full file name works in all of them.

### The installed app: `src/installed-app.ts` and `src/service-worker/`

The site is a web app that can be installed: `public/manifest.webmanifest` names it, gives its
icons, and asks for a window of its own (`display: standalone`); `index.html` links it and adds
what iPhone and iPad read instead (`apple-touch-icon`, the title). The PNG icons in
`public/icons/` are renders of `public/favicon.svg` (192 and 512 pixels) and of
`public/icons/maskable.svg` (the maskable icon, and the 180-pixel `apple-touch-icon.png`);
render them again when the mark changes.

`installed-app.ts` registers `sw.js` in the built site only (during development a worker would
serve old files), and keeps the browser's offer to install (`beforeinstallprompt`) in a small
store. `InstallCard` on the home page shows that offer, or the Share menu on an iPhone or iPad.
`useWakeLock` keeps the screen on while a song page is open, and `FullScreenButton` asks for
full screen where the browser has it for pages.

The worker is written in `src/service-worker/worker.ts`. It has a type check of its own
(`src/service-worker/tsconfig.json`, with the types of a worker instead of the DOM), and
`scripts/service-worker-plugin.ts` bundles it with esbuild into `dist/sw.js` at the end of the
build. The plugin hands it, as `BUILD`, the files of the shell (the page as `./`, every file of
the build up to 1 MB, and the files at the top of `public/`), every file under `assets/`, and a
version: a hash of the whole build. The rules are in `routes.ts`, which has no worker types so
that the tests can run it:

| Request                                        | Answer                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| A page (navigation)                            | The network, kept as the one copy of the page; the copy when  |
|                                                | the network fails, errs (5xx), or takes more than 4 seconds   |
| `assets/…`, `samples/…`                        | The kept copy; a file seen for the first time is kept         |
| Other files of the site                        | The copy of the shell, otherwise the network                  |
| `api/me`, `api/private-songs`, `api/notes` GET | As a page; a 401, or `/api/me` without an account, clears the |
|                                                | kept copies of the account                                    |
| Any other request, the sign-in, every write    | Not touched                                                   |

The caches are `msa-shell-<version>` (the shell of one build), `msa-kept` (files with a hash,
and the samples with their version), and `msa-account`. On installing, the worker fetches the
shell and the samples it does not have yet; on activating, it deletes the shells of earlier
builds and the files of `msa-kept` that the build no longer names. It takes over at once
(`skipWaiting`, `clients.claim`): pages and API answers come from the network first, so an open
page loses nothing, and the next start has the new version.

### `scripts/check-songs.ts`

Runs the same engine from the command line and prints the issues for every song, arrangement,
right-hand part, and written passage (introduction, bridge, key lift, ending). It is the
quickest way to verify a transcription or an arrangement before opening the app. It also
says whether the reading of a song (`analysis.md`) is written and whether the player has left
notes on it, the two things to read before a song is arranged or revised.

### `server/`: the API and the production server

Plain Node, without a framework or any package at run time; `npm run build:server` bundles it
into `dist-server/main.js`.

| File               | Responsibility                                                              |
| ------------------ | --------------------------------------------------------------------------- |
| `api.ts`           | The routes under `/api`, who may use them, and the sign-in pages            |
| `google.ts`        | Sign-in with Google: authorization code flow with PKCE, checks on the token |
| `session.ts`       | Signed cookies and the session they carry                                   |
| `object-store.ts`  | Text objects by key: the interface, and a store in a folder on disk         |
| `r2-store.ts`      | The same interface on the R2 bucket, through its S3 API                     |
| `song-catalog.ts`  | Which songs exist; the index of the private songs, and each song whole      |
| `notes-store.ts`   | `notes.json` per song, under `<song id>/notes.json` in a store              |
| `private-songs.ts` | Reads the songs under `songs/private` on disk                               |
| `user-state.ts`    | The state document of each account; moving it over from before the database |
| `database.ts`      | The SQLite database: users, state, comments; brought up to date when opened |
| `backup.ts`        | A daily copy of the database in the bucket, the last 14 kept                |
| `comments.ts`      | What a comment may be, and how its writer sees it                           |
| `admin.ts`         | The author's tasks on the database: fetch comments, write answers           |
| `static-files.ts`  | Serves the built site, with long caching for hashed assets                  |
| `request-url.ts`   | Reads the path of a request; `//` stays a path instead of naming a host     |
| `config.ts`        | Reads the settings of the server from its environment                       |
| `main.ts`          | The production server: the API, then the site                               |

`createApi` returns one handler that works in two settings:

- **On the public server** anybody signs in with Google. The browser is sent to Google with a
  random state, a nonce, and the hash of a PKCE verifier, all kept in a signed cookie for ten
  minutes; the server trades the returned code for an ID token, checks issuer, audience,
  expiry, nonce, and that the address is verified, records the user in the database, and gives
  a session. A session is a signed cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) that names the
  account and lasts 30 days; there is no table of sessions. Every request reads the role from
  `OWNER_EMAILS`: an owner may use the licensed songs and the notes, a member only the state
  and the account. Changes (`PUT`, `POST`, `DELETE`) must come from the site's own origin.
- **On a development machine** (`scripts/dev-api-plugin.ts`, mounted by `vite.config.ts` in the
  development and the preview server) the computer is the owner and nobody signs in. Notes are
  written next to `song.txt`, where they are read in the editor; the database is
  `.local/data/app.db`.

The users and their state are kept in a SQLite database (`AppDatabase`), through Node's
built-in `node:sqlite`. Its schema is a list of steps in `database.ts`, applied in order when the
database is opened and recorded in `PRAGMA user_version`; a change to the schema is a new step,
never an edit of an old one. It runs in WAL mode with foreign keys, so deleting a user removes
everything kept for them. The module takes `node:sqlite` with `process.getBuiltinModule` when a
database is opened, not with an import, because the Vite configuration loads the server code
and a build must work on a Node without the module. Node 22.5 to 22.12 need
`--experimental-sqlite`; `scripts/node-with-sqlite.mjs` adds it where needed (`npm run dev`,
`npm run preview`, `npm start`), and the test workers get it from `test.execArgv`.

What is not code and not a user is kept in an `ObjectStore`: text by key, with `get`, `put`,
`delete`, and `list`:

| Setting             | Private songs (`SongCatalog`) | Notes                           | Users and state       |
| ------------------- | ----------------------------- | ------------------------------- | --------------------- |
| Development machine | `songs/private` on disk       | `songs/<id>/notes.json`         | `.local/data/app.db`  |
| Server with R2      | bucket, `songs/private/…`     | bucket, `notes/<id>/notes.json` | `data/app.db`, copies |
|                     |                               |                                 | in bucket, `backups/` |
| Server without R2   | `songs/private` on its disk   | `data/notes/`                   | `data/app.db`         |

For the owner's library the catalog answers with index entries (`privateIndex`): it lists the
bucket on every request, parses a song again only when the tag of one of its files has changed,
and keeps the entries, not the files. A song is fetched whole when it is opened
(`privateSong`, `GET /api/private-songs?id=<song id>`). So a song pushed with
`npm run songs:push` appears without a deploy and without a restart, and the answer for the
library stays small with hundreds of songs. Public songs are always read from the songs folder,
which every deploy replaces.

State documents from before the database (`users/<address>.json` in the bucket or the data
folder) are moved into it the first time their account asks for its state.

Song ids and keys must be paths of plain names, so no request can read or write outside the
songs, the notes, and the state. Whatever arrives as notes is passed through `readNotes`; a
state document must be a small JSON object. Files on disk are written through a temporary file
and a rename, so a reader never sees half of one. The R2 store signs its requests with
`aws4fetch`, which esbuild bundles into the server.

`npm run notes:pull` reads the notes from the bucket and brings them into the song folders
here, and `npm run songs:push` sends the private songs the other way (`scripts/r2.ts` opens the
bucket with the token in `.env.production`).
`useMeasureNotes` asks the API only for an owner; a guest keeps notes in `localStorage`, and
they join the account the next time its owner signs in on that browser.

Comments are the members' side of notes (`server/comments.ts`). A comment is stored in the
`comments` table with its place on the sheet (read like a note, through `readNotes`), and waits
there: the server never answers it. The author fetches them with `admin.js comments`, which
marks them as read and lists them with the name of their writer and a short tag instead of the
address, and answers with `admin.js replies`. `scripts/comments.ts` runs both over SSH (or on
the local database) and keeps the comments in `comments.json` beside each song. A member may
send 30 comments a day of up to 1000 characters, only on songs they may open.

In the app, `useMeasureComments` takes the place of `useMeasureNotes` for a member: a comment
has the shape of a note plus where it stands (`readAt`, `reply`, `replySeen`), so the sheet
marks it and the guide lists it the same way, while `CommentDialog` shows the answers and marks
them as seen. `RepliesCard` on the home page lists the songs with answers not seen yet.

The dev plugin and the song index plugin are loaded by `vite.config.ts`, so everything they
import becomes part of the configuration, the engine included. That is why the modules of
`src/core` name the files they import with their extension.

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
- the server: signed values and cookies, every check of the Google sign-in (with a stand-in
  for Google), who may use which route on a running API (guest, member, owner), deleting an
  account, the database and moving state into it, the daily copies, and comments: what may be
  sent, the daily limit, reading and answering them, and the files they are kept in here, the files it keeps, the built site it
  serves without leaving its folder, and its configuration;
- storage: objects on disk and in R2 (with a stand-in for its S3 API that pages its listings),
  the signature of every request, and the catalog that reads private songs from the bucket and
  fetches a file again only when it changed;
- the service worker: which strategy answers which request, when the account is forgotten, and
  which files of a build are fetched on installing;
- the library: the index entry of a song, categories read from the header, and the grouping
  by category and subcategory, with the hymnals hidden from everybody but the owner;
- every committed song must load without errors or warnings.

The audio engine and the React components are thin layers over the tested core and are verified
by running the app.

# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project tooling: Vite, React, TypeScript, Vitest, ESLint, and Prettier.
- Repository rules in `CLAUDE.md`.
- A `commit-msg` git hook that rejects commit messages carrying AI attribution.
- Core music engine in `src/core`, independent of the browser:
  - a parser for numbered-notation song files (header, melody, chords, lyrics, sections);
  - chord-symbol parsing and note spelling relative to the key;
  - left-hand notation written in chord-relative degrees, including stacked notes;
  - the baseline left hand (root, fifth, octave on the printed chords);
  - arrangement validation (range, hand span, low close intervals, slash-chord bass, clashes
    with the melody);
  - conversion of a song and an arrangement into timed note events.
- `npm run check`, a command-line checker for song folders, with `--dump` to list the left-hand
  notes of every measure.
- The song and arrangement file format, documented in `docs/song-format.md`.
- A public-domain demo song, "Amazing Grace", with left-hand arrangements.
- The web app:
  - a numbered score with the melody and the left hand on two aligned rows, chords, lyrics,
    section labels, beams, octave dots, accidentals, and vertically stacked notes;
  - an arrangement picker with the baseline "My style" and every stored arrangement, and a side
    panel that explains new patterns, practice tips, and each changed measure;
  - playback with a sampled piano, separate channels for the two hands (both, right only, left
    only), tempo control, a metronome with count-in, and looping over a range of measures;
  - a playhead that highlights the notes being played and keeps the current measure in view;
  - keyboard shortcuts for play, stop, and hand selection;
  - a list of errors and warnings for the song and the selected arrangement.
- A test launcher (`scripts/run-tests.mjs`) that starts Vitest from the canonical working
  directory, so the tests also pass in Windows terminals that report a lowercase drive letter.
- Piano samples from the Salamander Grand Piano (CC BY 3.0).
- A GitHub Actions workflow that checks formatting and runs `npm run verify` on every push and
  pull request.
- Documentation: usage in `README.md`, code structure in `docs/architecture.md`, purpose and
  planned work in `docs/roadmap.md`, and the `new-song` skill for adding a song from a score.
- Transposition by half steps, up to six in either direction. Pitches and chord symbols move;
  the written digits stay the same.
- An introduction section above the song, with two choices: the last phrase of the song, played
  with the selected left hand, or a newly written ("improvised") introduction stored in
  `arrangements.json`. Playback starts with the introduction when one is selected.
- Left-hand arrangements grouped by level (easy, intermediate, advanced) and tagged with a
  musical style. "Amazing Grace" now has seven: ballad, waltz, contemporary, classical (Alberti
  bass), gospel, majestic, and jazz.
- Dynamics: `{pp}` to `{ff}` and the hairpins `{<}` and `{>}` in the notation. They are drawn
  between the two rows of the sheet and scale the loudness of the playback.
- Stacked notes in the right hand, used by written introductions.
- Chord extensions (`C6`, `C69`, `Cm6`, `C9`, `C13`, `C7b9`, …). An extension that a chord names
  decides what the degrees 2, 4 and 6 mean in left-hand notation and counts as a chord tone when
  the melody is checked against the chord.
- Printing and saving as PDF: a print layout for A4 paper with the selected arrangement, key,
  and introduction.
- A guide panel, hidden by default, that explains the selected arrangement.
- The checker reports the level and style of every arrangement and validates the written
  introduction.

- Staff notation: a switch in the toolbar draws the score on a grand staff (treble clef for the
  melody, bass clef for the left hand) with key and time signatures, ties, beams, accidentals,
  chord symbols, lyrics, dynamics, and hairpins. The playhead, click-to-seek, the introduction
  block, and printing work in both notations. The engraver (Verovio) loads on demand.
- Several written introductions per song, each with a name and a style, next to the last-phrase
  introduction.
- Gap detection: `npm run check` lists the places where the melody waits for more than two
  beats and warns when the left hand does not mark every beat there or, from the intermediate
  level on, does not move.
- The 61-key keyboard as the target instrument: a warning for left-hand notes below C2, and
  transposition that keeps the left hand on the keyboard.
- Downloads: a menu in the toolbar saves the performance on the sheet (introduction,
  arrangement, key, dynamics), at the current tempo and with the hands that are switched on, as
  - a Standard MIDI File with one track per hand, or
  - an MP3 recording, rendered faster than real time with the piano of the app and raised to a
    normal listening level.
- Fills in "Amazing Grace" where the melody holds (measures 7 and 8) for the majestic and jazz
  arrangements.
- Right-hand parts. A **Right hand** menu chooses between the printed melody, _Melody + fills_
  (every printed note stays; fills are added where the melody waits), and _Accompaniment_
  (chords, rhythm, and fills for accompanying singers). The parts are stored per arrangement
  under `rightHand`, and under `baseline.rightHand` for "My style", so they follow the chords
  of the selected left hand and share the gaps with it; a measure may replace the left hand
  where the hands trade roles.
- The sung melody of an accompaniment: a small row above the right hand on the numbered sheet,
  a staff of its own in staff notation, both with the lyrics; a **Voice** button (key `V`)
  that plays it as a soft guide tone; a third track in the MIDI file and in the MP3 recording.
- Checks for right-hand parts: fills must keep the melody in place and on top and add
  something in every gap; an accompaniment must be written for every measure, stay above the
  left hand, and stay clear of the chord and of the sung melody by more than a half step; the
  two hands together must mark every beat of a gap.
- Right-hand parts for every arrangement of "Amazing Grace", "My style" included.

- A home page. The app now opens on an overview of the library instead of the first song:
  totals, a "Continue practising" card for the song that was opened last, and a card per song
  with its key, meter, tempo, styles, and the number of left hands, right-hand parts, and
  introductions. Songs can be searched, sorted by date, title, or number, and marked as
  favourites.
- Addresses per song (`#song=<id>`) that work with the Back button and bookmarks, an "All
  songs" link in the top bar, and the left hand last used for a song restored when it is
  opened again.

- A layout for phones and tablets. In a narrow window the options above the sheet form one
  row that scrolls sideways and stays at the top, menus open as sheets from the bottom edge
  with a Done button, the playback bar takes two short rows (one on a phone held sideways),
  and the guide opens above the sheet instead of below it.
- The tempo can be typed: click the number, type a value, and press Enter. Escape cancels, the
  arrow keys step by one, and with Shift by ten.

- A bridge after the _Last phrase_ introduction (`intro.bridge` in `arrangements.json`): one
  or two measures that move to the dominant and give the singers their cue.
- Endings (`endings` in `arrangements.json`): written closes in several styles, chosen from an
  **Ending** menu and played after the last measure of the song.
- A repeat in a higher key, a modulation. With **Repeat** set to a half step or a whole step,
  the song is played twice and the score continues below the first time through: an interlude
  (the written key lift, `modulation`, then the selected introduction again) leads into the
  song in the new key, and the ending follows there. Each block has a heading with its key,
  staff notation gives each its own key signature, and the MIDI file changes key signature at
  the repeat.
- A bridge, a key lift, and five endings (Amen, rising arpeggio, gospel, grand, jazz) for
  "Amazing Grace".
- `npm run check` lists the bridge, the key lift, and the endings of every song, and says which
  of them are not written yet.

- Rolled chords. A stack written as `~<1 3 5>` is struck one note after the other, from the
  bottom, about thirty milliseconds apart, in the playback, the MP3, and the MIDI file. The
  numbered sheet draws a wavy line in front of it and staff notation the arpeggio line. The
  endings and the final chords of "Amazing Grace" use them.

- Hymnals. A song names the hymnal it is taken from with `book:` in its header (`KK` Kidung
  Keesaan, `PKJ` Pelengkap Kidung Jemaat, `KJ` Kidung Jemaat, `KPJ` Kidung Pasamuwan Jawi) and
  is cited as "PKJ 184" on its card, in the song menu, and above the sheet. The home page lists
  the songs in a section per hymnal, a row of buttons narrows the list to one hymnal and shows
  how many songs each has, and the search finds a song by the code or the name of its hymnal.
  Other codes get a section of their own; songs without a hymnal are listed under "Other songs".

### Fixed

- Printed scores and PDFs lost every octave dot, beam, accidental stroke, and hold unless
  "Background graphics" was switched on in the print dialog, because those marks were filled
  boxes and browsers leave backgrounds out on paper. They are drawn with borders now and print
  with the default settings.
- Syllables and chord symbols no longer run into each other where notes follow closely
  ("Yang di", "F♯m/A A♯°7"): a measure is widened when its text needs more room than its notes.

- Dynamics could hardly be heard: from one level to the next the loudness changed by less than
  two decibels, and from mezzo-piano to forte by three. The levels are now four to five
  decibels apart (nine from mezzo-piano to forte), in the playback, the MP3, and the MIDI file.
  Mezzo-forte is as loud as before.

- The last note of a right-hand fill was cut off at its written length, so a run stopped dead
  a beat before the melody came back. It now rings until the right hand plays again, and is
  let go earlier only when the harmony moves to a chord it does not belong to.

### Changed

- The notes under the top note of a right-hand chord are played a little softer than the top,
  so the melody stays in front.
- A measure that was cut short for the pickup is completed with holds when a bridge, an
  interlude, or an ending follows it, so the meter stays intact.
- The sheet is drawn in sections with headings (Intro, Song, Interlude, Ending); the loop menu,
  the position readout, and the list of issues name measures by their section.
- Loudness follows the square of a note's velocity, as on MIDI instruments, so a MIDI file
  played elsewhere keeps the balance of the app. The velocities in MIDI files changed
  accordingly: the hands are closer in number and the dynamic levels further apart.
- On paper the notes and the final barline are black, a hold is the size of a full stop, and
  the "Local only" badge is left out.
- The song menu in the top bar is grouped by hymnal and sorted by number.
- `npm run check` prints the hymnal and number in front of each title.

- In _Melody + fills_ the melody row now stays exactly as printed, and the notes a fill adds
  are shown as a second voice: a row marked `+` below the melody on the numbered sheet, and a
  second layer on the same staff in staff notation. A long melody note is no longer cut short
  where the fill begins: it is drawn, and sounds, for its full length. The added notes are
  played slightly softer than the melody. Song files do not change.
- The tempo number no longer resets the tempo when clicked; the arrow button beside it does.
- A section label on a short pickup measure no longer runs into the next measure number.
- Leaving a song page stops the playback.
- The engine addresses note events and playhead spans by `track` (right, left, or voice)
  instead of `hand`, and the MIDI writer takes a list of tracks.
- Guide, Print and Download move together to a second toolbar row when the window is narrow.

- `intro.improvised` in `arrangements.json` became the list `intro.written`, whose entries have
  an `id`, a `name`, and a `style`.
- A lowered fifth is written as a raised fourth, the more familiar spelling in numbered notation.

- The interface is organised around a toolbar of drop-down menus (left hand, intro, key, visible
  rows) instead of showing every option at once. Song credits and the notation legend are folded
  away under "Details", and the explanation panel opens on request.
- The loop range is chosen from measure names (including introduction measures and the pickup)
  instead of typed numbers.
- Note velocities are now relative to mezzo-forte, so that dynamic marks have room in both
  directions.
- Spellings that name a plain scale note (such as a flattened 1 or a sharpened 7) are written as
  that scale note.

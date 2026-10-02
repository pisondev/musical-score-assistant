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
- Fills in "Amazing Grace" where the melody holds (measures 7 and 8) for the majestic and jazz
  arrangements.

### Changed

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

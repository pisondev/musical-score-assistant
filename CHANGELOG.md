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
- A public-domain demo song, "Amazing Grace", with three left-hand arrangements.
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
- Documentation: usage in `README.md`, code structure in `docs/architecture.md`, purpose and
  planned work in `docs/roadmap.md`, and the `new-song` skill for adding a song from a score.

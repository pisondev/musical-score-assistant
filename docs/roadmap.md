# Roadmap

## Purpose

The tool serves one player: a church pianist who plays as a hobby, is comfortable with numbered
notation, and has so far played the same left-hand pattern on every song. It exists to supply
ideas: more interesting left-hand parts, including different chord choices, that can be heard,
compared, and then practised.

## Workflow

1. A photo of the printed score is handed to a coding assistant in the editor.
2. The assistant transcribes the melody and chords into `song.txt` and runs `npm run check`.
3. The player listens to the right hand alone in the app and compares it with the printed score.
   Corrections go back to the assistant or straight into `song.txt`.
4. The assistant writes `arrangements.json` with several left-hand versions and checks it again.
5. The player switches between the versions in the app, listens to the left hand alone and to
   both hands, and reports what works and what does not.

The web app itself never generates music; it displays, plays, and explains.

## Done

- Song and arrangement file formats, with a command-line checker.
- Numbered score for both hands with chords, lyrics, sections, and stacked notes.
- Baseline left hand generated from the printed chords.
- Stored arrangements with per-measure explanations, new-pattern descriptions, and practice tips.
- Playback with separate hands, tempo control, metronome with count-in, and looping.
- Playhead highlighting on the score and automatic scrolling.
- Validation of range, hand span, low close intervals, slash-chord bass, and melody clashes.

## Next

- **Repeats in playback.** Repeat barlines are displayed but played straight through.
- **Volume balance** between the hands.
- **Pattern library** shared across songs: patterns the player liked, and ideas that were
  rejected, so new arrangements build on that history.
- **Print layout** tuned for paper: page breaks, margins, and a compact header.
- **Phone and tablet polish** for use at the piano.

## Later

- Staff-notation view or MusicXML export.
- Suggested introductions and endings.
- Different arrangements per verse.
- Practice with a MIDI keyboard that waits for the right notes.

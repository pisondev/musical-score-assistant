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
4. The assistant reads the song: every verse of the text and the whole tune. What the song
   says, the mood it needs, and where its climax lies are written down in `analysis.md`, and
   the dynamics and everything arranged afterwards follow that reading.
5. The assistant writes `arrangements.json` with five left-hand versions and checks it again:
   the player's favourites first (Alberti bass, gospel, shell voicings), then a contemporary
   and a majestic one. Few versions that are each worth practising count for more than a long
   menu.
6. The assistant adds the right-hand parts of every arrangement: fills for the gaps, and an
   accompaniment for singers.
7. The player switches between the versions in the app, listens to the left hand alone and to
   both hands, and writes what works and what does not as notes on the measures concerned.
8. The assistant reads the reading and those notes (`notes.json` in the folder of the song)
   the next time the song is worked on, and revises the files.

The web app itself never generates music; it displays, plays, and explains.

## Done

- Song and arrangement file formats, with a command-line checker.
- Numbered score for both hands with chords, lyrics, sections, and stacked notes.
- Baseline left hand generated from the printed chords.
- Stored arrangements with per-measure explanations, new-pattern descriptions, and practice tips.
- Arrangements grouped by level (easy, intermediate, advanced) and tagged with a style: ballad,
  hymn or waltz, contemporary, classical, gospel, majestic, jazz.
- An introduction before the song: its last phrase with a bridge, or one of several written
  ones.
- Written endings in several styles, and a repeat of the song in a higher key after an
  interlude that lifts the key.
- Fills in every gap of the melody, checked automatically.
- Right-hand parts paired with every left hand: the melody with fills, and an accompaniment for
  singers, with the sung melody as a cue on the sheet and a guide voice in the playback.
- Staff notation as an alternative to numbered notation.
- A 61-key keyboard as the target instrument.
- Transposition by half steps.
- Dynamics (pp to ff, crescendo, diminuendo) on the sheet and in the playback.
- Playback with separate hands, tempo control, metronome with count-in, and looping.
- Playhead highlighting on the score and automatic scrolling.
- Printing and saving as PDF, laid out for A4.
- MIDI and MP3 download of the performance on the sheet.
- A compact interface: drop-down menus for the options, and a guide that opens on request.
- A home page that lists the library, with search, favourites, and "continue practising".
- Songs grouped by hymnal (Kidung Keesaan, Pelengkap Kidung Jemaat, Kidung Jemaat, Kidung
  Pasamuwan Jawi) and cited by code and number.
- A layout for phones and tablets: the controls in one row at the top, menus as bottom sheets,
  and a compact playback bar; about two measures per line on a phone held upright and four held
  sideways, and a zoom on every screen.
- The app installed on a phone, tablet, or computer: a window of its own, use without a
  connection, a screen that stays on during a song, and full screen.
- The settings of the score behind one Options button in the top bar.
- A progress bar that names the part of the piece in view and leads to the other parts.
- A look in one family of colours, from emerald through cyan and ocean blue to navy.
- The public site on the VPS, with Google sign-in for the owner: private songs, notes,
  favourites, and settings follow the account on every device.
- A menu on every measure for looping that spot, with a counted rest between the rounds.
- Notes on measures, saved in the folder of the song for the next revision.
- A written reading of each song (text, tune, mood) that its arrangements follow.
- A tempo that can be typed as well as dragged.
- Fills as a second voice: the melody keeps its long notes on the sheet and in the sound.
- Validation of range, hand span, low close intervals, slash-chord bass, and melody clashes.

## Next

- **Repeats in playback.** Repeat barlines are displayed but played straight through.
- **Tempo changes** such as ritardando and a fermata on the last chord; endings are played in
  strict time for now.
- **More than one verse**, so that a repeat can carry the words of the next verse.
- **Dynamics per arrangement**, so that a majestic version can be louder than a ballad.
- **Volume balance** between the hands and the voice guide.
- **Pattern library** shared across songs: patterns the player liked, and ideas that were
  rejected, so new arrangements build on that history.
- **More styles** as they are asked for: ragtime, pop, Latin.

## Later

- MusicXML export.
- Different arrangements per verse.
- Practice with a MIDI keyboard that waits for the right notes.

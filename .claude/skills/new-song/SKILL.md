---
name: new-song
description: Add a song to the app from a photo or scan of a numbered-notation score. Transcribes the melody and chords into song.txt, writes left-hand arrangements by level and style plus an introduction into arrangements.json, and checks both. Use when the user provides a score image and asks for a song, a transcription, or left-hand suggestions.
---

# Add a song from a printed score

Read `docs/song-format.md` before writing any file. It is the authority on syntax.

## 1. Set up the folder

- Use `songs/private/<number>-<title-in-kebab-case>/` unless the user states that the song is in
  the public domain. The repository is public and `songs/private/` is git-ignored.
- Save the image there as `source.jpg` (or `source-1.jpg`, `source-2.jpg` for several pages).

## 2. Transcribe the melody into `song.txt`

1. Read the whole image first, then crop each system and read it again at full resolution. Small
   marks decide the result:
   - a dot **below** a digit lowers it an octave (`5,`), a dot **above** raises it (`1'`);
   - a line **above** digits is a beam: wrap the notes that share one beat in `( )`;
   - a digit crossed by `/` is sharpened (`#4`), crossed by `\` is flattened (`b7`);
   - a dot on the baseline holds the previous note; under a beam it holds for half a beat, so
     `3 . 5` with the dot and the 5 under one beam is `3 (. 5)`;
   - a comma-like tick between notes is a breath mark and is not transcribed.
2. Copy the header from the score: `title`, `number`, `key` (from "do = f"), `time`, `tempo`.
3. Place each chord before the note it is printed above. Chords printed over the second note of a
   beamed pair belong to that note: `(5 [C/E]4)`.
4. Add the first verse as `L:` lines, one syllable per note, `_` where a note continues a
   syllable.
5. Mark anything that cannot be read with certainty with `?` and tell the user which measures to
   compare against the page.
6. Run `npm run check -- <folder>`. Every measure must add up; fix errors before continuing.

Ask the user to listen with **Right** selected and confirm the melody before spending effort on
arrangements, unless they asked for everything in one go.

After the melody is confirmed, add dynamics to `song.txt` (`{mp}`, `{<}`, `{f}` and so on):
soft at the start, growing to the most intense line of the text, soft again at the end. Printed
hymnals rarely give dynamics, so note in a comment that they are an interpretation.

## 3. Write `arrangements.json`

Write these seven arrangements unless asked otherwise. Keep the ids so the menu is consistent
across songs; the `level` decides the column and the `style` is the tag the player sees.

| id                 | level        | style             | What it teaches                                                             |
| ------------------ | ------------ | ----------------- | --------------------------------------------------------------------------- |
| `one-step-further` | easy         | Ballad            | Printed chords. Arpeggios to the tenth, sevenths; at most two new patterns. |
| `walking-bass`     | easy         | Hymn (Waltz in 3) | Inversions so the bass moves by step; a bass note, then two notes together. |
| `new-chords`       | intermediate | Contemporary      | Some chords replaced: minor sevenths, IV over V, an Amen ending.            |
| `alberti-bass`     | intermediate | Classical         | Broken chords, lowest-highest-middle-highest, staying in one hand position. |
| `gospel`           | intermediate | Gospel            | Octave bass, walk-ups, passing diminished chords, the minor four chord.     |
| `majestic`         | advanced     | Majestic          | Octave in the bass, then a full chord; broad and loud for a congregation.   |
| `jazz`             | advanced     | Jazz              | Shell voicings (`<1 7 3'>`), two-five-one chains, tritone substitution.     |

Other styles are welcome when the user asks for them; choose the level by how hard the left
hand is to play, not by how unusual the chords are.

Then write the introductions under `intro`:

- `lastPhraseFrom`: the measure number where the closing phrase of the song begins.
- `written`: three or four introductions in different styles (for example gospel, classical,
  majestic, jazz), each with an `id`, a `name`, a `style`, and a `summary`. Four measures or so,
  with both hands written out (`right` relative to the key, `left` in chord degrees). Give each
  a shape: a line that rises and falls, a bass that moves, and an ending that lets the song
  enter. Every measure must be full except the last, which together with the pickup of the song
  must make one full measure.

### The first criterion: fill the gaps

This is what the player asked for above everything else. A gap is a place where the melody
starts no new note for more than two beats: a long held note, or a rest before the next phrase.
With only a repeated arpeggio underneath, the gaps sound monotonous and the congregation cannot
tell when to come in.

1. Run `npm run check -- <folder>` once the melody is in place. The line `gaps to fill` lists
   every gap. Also look at notes held for exactly two beats; they profit from movement too.
2. In every gap, in every arrangement:
   - sound the left hand on **every beat**, so the pulse stays audible;
   - from the intermediate level on, write a **fill that moves** (eighths, sixteenths, or a
     triplet) and belongs to the style:

     | Style        | Fills that fit                                                             |
     | ------------ | -------------------------------------------------------------------------- |
     | Ballad       | An arch up through the chord to the high fifth and back                    |
     | Hymn         | The bass walks one step per beat towards the next chord                    |
     | Contemporary | A neighbour chord over the same bass (IV over I), a suspension             |
     | Classical    | A scale run up and back, the Alberti figure in double time, a sweep        |
     | Gospel       | An octave walk-up through a diminished chord, a triplet roll, a bass run   |
     | Majestic     | Rising chord positions, a drum roll of repeated chords, octave walk-ups    |
     | Jazz         | A walking bass between shells, a chord answered off the beat, a turnaround |

   - **lead into the next entry**: put a clear bass note or chord on the beat just before the
     melody returns, and let the line point at the next chord;
   - use a **different fill in each gap** of the same arrangement.
3. Mention each fill in the `note` of its measure, starting with "Fill:", and list the fill
   figures under `patterns`.

Guidelines:

- **Left hand moves when the melody rests, and rests when the melody moves.** Fills under long
  melody notes; plain quarter notes under busy melody.
- **Write for a 61-key keyboard.** The lowest key is C2: never write a left-hand note below it,
  not even as the lower half of an octave.
- **Keep it playable.** Stacked notes span at most an octave (a tenth for `advanced`). Stay
  between C2 and E4 and below the melody. Avoid thirds below C3.
- **Check every new chord against the melody** on the beats where it sounds. A melody note that
  lasts a beat or more must not sit a half step from a chord tone. When the note is meant to be
  a ninth or thirteenth, name it in the symbol (`Gm9`, `C13`).
- **Name extensions you use.** The degrees `2`, `4` and `6` follow the chord symbol when it names
  them (`Dm6`, `A9`); otherwise they follow the key of the song.
- **Slash chords** need their bass as the first left-hand note of the chord (`[C/E]3 ...`).
- **Reuse shapes.** An arrangement that introduces two or three ideas and repeats them is easier
  to learn than one that changes every measure.
- **Explain.** Give every measure that departs from the baseline a one-sentence `note` saying
  what changed and why it works. List each new idea under `patterns` with a name, its notation,
  and when to use it. Add two or three `tips` for practising.
- Write all text in plain English. Describe pitches by letter name or scale degree.

## 4. Verify

1. Run `npm run check -- <folder> --dump`.
2. Read the dump measure by measure and confirm the pitches are the ones intended; the degrees
   are relative to the chord root, so slash-chord basses are easy to get wrong.
3. Resolve every error and every warning. A warning may stay only if it is deliberate, and then
   say so in the hand-over.

## 5. Hand over

Tell the user:

- where the song is and how to open it (`npm run dev`, then pick the song);
- which notes were uncertain in the transcription;
- what each arrangement does in one line, and any chord that was replaced;
- how each gap is filled in each arrangement, in a line or two;
- that the dynamics and the written introductions are your own suggestions.

Do not commit or push unless the user asks.

# Song format

Every song lives in its own folder under `songs/`:

```
songs/
  amazing-grace/
    song.txt             melody, printed chords, and lyrics
    arrangements.json    left-hand arrangements (optional)
  private/               git-ignored: copyrighted songs stay on this machine
    <song>/
      song.txt
      arrangements.json
      source.jpg         scan or photo of the printed score (never committed)
```

The app and `npm run check` pick up every folder that contains a `song.txt`.

## `song.txt`

A plain-text file with a header followed by the melody.

```
title: Amazing Grace
composer: Traditional American melody (New Britain)
lyricist: John Newton, 1779
key: G
time: 3/4
tempo: 84

section: Verse
| 5, | [G]1 . (3 1) | 3 . 2 | [C]1 . 6, | [G]5, . 5, |
L: A-ma-zing _ grace! how sweet the sound, that
```

### Header

One `name: value` pair per line, before the first line of music.

| Field      | Meaning                                                                            | Default   |
| ---------- | ---------------------------------------------------------------------------------- | --------- |
| `title`    | Song title                                                                         | Untitled  |
| `number`   | Number in the hymnal or songbook                                                   | none      |
| `composer` | Composer of the melody                                                             | none      |
| `lyricist` | Author or translator of the text                                                   | none      |
| `source`   | Where the score comes from                                                         | none      |
| `key`      | The note that "1" stands for: `C`, `F`, `Bb`, `F#`, `Bes`, `Es`                    | `C`       |
| `mode`     | `major` or `minor`; minor songs are written from 6                                 | `major`   |
| `time`     | Time signature such as `4/4`, `3/4`, `6/8`                                         | `4/4`     |
| `tempo`    | Beats per minute, counted in beats of the time signature                           | `80`      |
| `octave`   | Octave of "1" for the melody (4 means C4 to B4); chosen automatically when omitted | automatic |

### Body

| Line             | Meaning                                           |
| ---------------- | ------------------------------------------------- |
| starts with `\|` | A line of music, split into measures by barlines  |
| `L: ...`         | Lyrics for the line of music directly above       |
| `section: Name`  | Labels the next measure as the start of a section |
| starts with `//` | Comment                                           |

### Notation

| Symbol          | Meaning                                                              | Example          |
| --------------- | -------------------------------------------------------------------- | ---------------- |
| `1` to `7`      | Scale degrees do to ti of the key                                    | `1 2 3`          |
| `0`             | Rest                                                                 | `1 0 3`          |
| `.`             | Hold: extends the previous note by the value of this position        | `5 . .`          |
| `'` and `,`     | One octave up or down; may be repeated                               | `1'` `7,` `5,,`  |
| `#` and `b`     | Sharp or flat, written before the digit                              | `#4` `b7`        |
| `( )`           | Divides one beat evenly among its contents; may be nested            | `(3 4)`          |
| `[C]`           | Chord that takes effect on the next note                             | `[F]3 . [C7]2 1` |
| `?`             | Marks the preceding note as uncertain so it is listed by the checker | `5?`             |
| `\|`            | Barline                                                              |                  |
| `\|\|`          | Final barline                                                        |                  |
| `\|:` and `:\|` | Repeat barlines (displayed; playback does not repeat yet)            |                  |

Rules:

- **Each symbol outside a group lasts one beat**, where a beat is the lower number of the time
  signature: a quarter note in 4/4 and 3/4, an eighth note in 6/8.
- **A group shares one beat equally.** `(3 4)` is two eighth notes, `(1 2 3)` is a triplet, and
  `(1 2 3 4)` is four sixteenth notes. Groups nest: `(5 (. 5))` is a dotted eighth followed by a
  sixteenth.
- **A hold inside a group** extends the previous note even when that note sits outside the
  group, so `3 (. 5)` is a dotted quarter followed by an eighth. A hold at the start of a measure
  continues the note across the barline.
- **Chords** may appear inside groups, and before rests or holds: `([Bb]2 [G/B]1)`.
- **The first measure may be shorter** than the time signature (a pickup). It has no number;
  the first full measure is measure 1. The last measure may be shorter as well.
- Every other measure must add up exactly; otherwise the checker reports an error and the app
  marks the measure.

### Chord symbols

Roots `A` to `G` with `#` or `b`, optionally followed by a quality and a slash bass:

`C` `Cm` `C7` `Cm7` `Cmaj7` `Cdim` (also `Co`) `Cdim7` `C+` (also `Caug`) `Csus4` `Csus2`
`C7sus4` `Cm7b5` `C6` `C9` `Cadd9` `C/E` `C7/Bb`

### Lyrics

Words are separated by spaces and syllables by hyphens. Each syllable belongs to the next note
of the line above (rests and holds are skipped). Use `_` for a note that continues the previous
syllable.

```
| [G]1 . (3 1) | 3 . 2 |
L: ma-zing _ grace! how
```

## `arrangements.json`

Left-hand arrangements for one song. The app always adds one more arrangement by itself, called
**My style**: root, fifth, octave on the printed chords.

```json
{
  "arrangements": [
    {
      "id": "walking-bass",
      "name": "Walking bass",
      "level": "easy",
      "summary": "One sentence that says what makes this version different.",
      "tips": ["A short practice hint."],
      "patterns": [
        {
          "name": "Bass and pair",
          "notation": "1 <5 1'> <5 1'>",
          "description": "What the pattern is and when to use it."
        }
      ],
      "measures": [
        { "measure": 0, "left": "0" },
        { "measure": 1, "left": "[G]1 <5 1'> <5 1'>" },
        { "measure": 2, "left": "[G/B]3 <5 1'> <5 1'>", "note": "Why this measure changed." }
      ]
    }
  ]
}
```

| Field                | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `id`                 | Unique identifier within the file                                 |
| `name`               | Name shown in the arrangement picker                              |
| `level`              | `easy`, `intermediate`, or `advanced`; sets the allowed hand span |
| `summary`            | One sentence shown under the name                                 |
| `tips`               | Practice hints                                                    |
| `patterns`           | Reusable ideas this arrangement introduces                        |
| `measures[].measure` | Printed measure number; `0` is the pickup measure                 |
| `measures[].left`    | Left-hand notation for that measure (see below), without barlines |
| `measures[].note`    | Short explanation shown next to the measure                       |

A measure that is missing from the list falls back to the baseline.

### Left-hand notation

The left hand uses the same symbols as the melody, with two differences.

**Digits are chord degrees, counted from the root of the current chord.**

| Degree          | Meaning                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `1` `3` `5` `7` | Root, third, fifth, seventh of the chord (minor chords give a minor third; sus chords give the suspended note) |
| `2` `4` `6`     | The notes of the song's scale between the chord tones, for passing notes                                       |
| `'` and `,`     | Octave up or down from the root's register                                                                     |
| `#` and `b`     | Raise or lower the degree by a half step                                                                       |

The root of every chord sits in the octave from C2 to B2. `1` is that root, `1'` the root an
octave higher, `5,` the fifth below the root. When a chord has no seventh of its own, `7` is the
seventh that belongs to the song's key.

**`< >` strikes several notes together.** `<5 1'>` is the fifth and the octave at once. The
sheet draws them as a vertical stack, lowest note at the bottom.

Chord symbols set the harmony from that point on, so an arrangement can keep the printed chords
or replace them:

```
[F](1 5) (1' 3') [Dm7](1 5) (7 5)
```

A measure without a chord symbol continues the chord of the previous measure.

**Slash chords** name their bass through its degree. The bass of `C/E` is the third, of `G7/D`
the fifth below the root, of `F7/Eb` the seventh below the root:

```
[C/E]3 5 1'        E2 G2 C3
[G7/D]5, <5 7>     D2, then D3 and F3 together
[F7/Eb]7, <5 1'>   E♭2, then C3 and F3 together
```

A chord symbol also lifts the sustain pedal in playback: left-hand notes ring until the next
chord symbol or the end of the measure.

### How the left hand is written on the sheet

The sheet shows the left hand in ordinary numbered notation relative to the key, not in chord
degrees. Its row has its own octave reference two octaves below the melody: for a song in F,
`1` on the melody row is F4 and `1` on the left-hand row is F2. A root-fifth-octave arpeggio on
the home chord therefore reads `1 5 1'`.

## Checking

```bash
npm run check                       # every song
npm run check -- songs/amazing-grace
npm run check -- --dump             # also list the left-hand notes of every measure
```

Errors (wrong number of beats, unknown chord, malformed notation) fail the check. Warnings do
not, but each one deserves a look:

- a left-hand note outside A1 to E4;
- stacked notes wider than an octave (a tenth for `advanced`);
- notes a third or less apart below C3;
- the left hand reaching up to the melody;
- a slash chord whose first left-hand note is not its bass;
- a chord that clashes by a half step with a melody note lasting a beat or more;
- a note marked with `?`.

# Song format

Every song lives in its own folder under `songs/`:

```
songs/
  amazing-grace/
    song.txt             melody, printed chords, lyrics, and dynamics
    arrangements.json    left hands, right-hand parts, introductions, key lift, endings (optional)
  private/               git-ignored: copyrighted songs stay on this machine
    pkj-184-<title>/     hymnal code, number, and title in lower case
      song.txt
      arrangements.json
      source.jpg         scan or photo of the printed score (never committed)
```

The app and `npm run check` pick up every folder that contains a `song.txt`. The name of the
folder is free; `<hymnal code>-<number>-<title>` keeps a growing library in order. Which hymnal
a song belongs to is decided by its header, not by the folder.

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
| {mp}5, | [G]1 . (3 1) | 3 . 2 | [C]1 . 6, | [G]5, . 5, |
L: A-ma-zing _ grace! how sweet the sound, that
```

### Header

One `name: value` pair per line, before the first line of music.

| Field      | Meaning                                                                            | Default   |
| ---------- | ---------------------------------------------------------------------------------- | --------- |
| `title`    | Song title                                                                         | Untitled  |
| `book`     | Code of the hymnal the song is taken from: `KK`, `PKJ`, `KJ`, `KPJ` (see below)    | none      |
| `number`   | Number in the hymnal or songbook                                                   | none      |
| `composer` | Composer of the melody                                                             | none      |
| `lyricist` | Author or translator of the text                                                   | none      |
| `source`   | Where the score comes from                                                         | none      |
| `key`      | The note that "1" stands for: `C`, `F`, `Bb`, `F#`, `Bes`, `Es`                    | `C`       |
| `mode`     | `major` or `minor`; minor songs are written from 6                                 | `major`   |
| `time`     | Time signature such as `4/4`, `3/4`, `6/8`                                         | `4/4`     |
| `tempo`    | Beats per minute, counted in beats of the time signature                           | `80`      |
| `octave`   | Octave of "1" for the melody (4 means C4 to B4); chosen automatically when omitted | automatic |

### Hymnals

`book` and `number` together are how a song is cited: `book: PKJ` and `number: 184` give
"PKJ 184" on the song's card, in the song menu, and above the sheet. The home page lists the
songs hymnal by hymnal and can narrow the list to one of them; the search finds a song by its
code, its number, or the name of its hymnal.

| Code  | Hymnal                  |
| ----- | ----------------------- |
| `KK`  | Kidung Keesaan          |
| `PKJ` | Pelengkap Kidung Jemaat |
| `KJ`  | Kidung Jemaat           |
| `KPJ` | Kidung Pasamuwan Jawi   |

The code is not case-sensitive. Any other code is accepted and gets a section of its own under
that code; to give it a full name, add it to the list in `src/core/hymnals.ts`. Songs without a
`book` are listed under "Other songs".

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
| `< >`           | Notes struck together, drawn as a vertical stack                     | `<3 5>`          |
| `~< >`          | The same notes rolled: struck one after the other, from the bottom   | `~<1 3 5>`       |
| `[C]`           | Chord that takes effect on the next note                             | `[F]3 . [C7]2 1` |
| `{mf}`          | Dynamic mark that takes effect on the next note (see below)          | `{p}1 2 {<}3 4`  |
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
- **Chords and dynamic marks** may appear inside groups, and before rests or holds:
  `([Bb]2 [G/B]1)`, `({<}0 1)`.
- **The first measure may be shorter** than the time signature (a pickup). It has no number;
  the first full measure is measure 1. The last measure may be shorter as well.
- Every other measure must add up exactly; otherwise the checker reports an error and the app
  marks the measure.

### Rolled chords

A stack written with `~` in front is a rolled chord, in either hand and in every kind of part:
`~<1 5 1'>`. The sheet draws a wavy line in front of it, staff notation the arpeggio line. In
playback and in the MIDI file its notes follow each other about thirty milliseconds apart, a
little closer in fast music. In the left hand the lowest note keeps the beat and the others
follow; in the right hand the roll leads up to the beat, so the top note, the melody, is on
time.

Roll a chord where it should bloom instead of strike: a long chord at the end of a phrase, the
chords of an _Amen_, a final chord, a chord too wide to reach at once. Leave rhythmic chords
solid.

### Dynamics

| Mark                                    | Meaning                                         |
| --------------------------------------- | ----------------------------------------------- |
| `{pp}` `{p}` `{mp}` `{mf}` `{f}` `{ff}` | Sets the loudness from that note onward         |
| `{<}`                                   | Crescendo hairpin, lasting until the next mark  |
| `{>}`                                   | Diminuendo hairpin, lasting until the next mark |

A hairpin glides from the level in force to the level of the mark that ends it:
`{mp}1 2 {<}3 4 | {f}5 . . .` grows from mezzo-piano to forte over two beats. A hairpin that no
level mark closes moves one level and lasts to the end of the song. A song without marks is
played mezzo-forte throughout.

Dynamics apply to both hands. They are drawn between the two rows of the sheet and scale the
loudness of every note in playback, in the MP3, and in the MIDI file. Printed hymnals rarely
give dynamics, so they are usually an interpretation; say so in a comment.

Each level is four to five decibels from the next, enough to be heard as a clear step:

| Mark   | Loudness against `mf` | MIDI velocity of a melody note on beat one |
| ------ | --------------------- | ------------------------------------------ |
| `{pp}` | 13.5 dB softer        | 36                                         |
| `{p}`  | 9 dB softer           | 47                                         |
| `{mp}` | 4.5 dB softer         | 61                                         |
| `{mf}` | reference             | 79                                         |
| `{f}`  | 4.5 dB louder         | 102                                        |
| `{ff}` | 8 dB louder           | 125                                        |

Only the loudness changes. The piano samples have one tone colour, so a forte does not sound
brighter than a piano, as it would on a real instrument.

### Chord symbols

Roots `A` to `G` with `#` or `b`, optionally followed by a quality, extensions, and a slash bass:

`C` `Cm` `C7` `Cm7` `Cmaj7` `Cdim` (also `Co`) `Cdim7` `C+` (also `Caug`) `Csus4` `Csus2`
`C7sus4` `Cm7b5` `C6` `C69` `Cm6` `C9` `Cm9` `C13` `C7b9` `Cadd9` `C/E` `C7/Bb`

### Lyrics

Words are separated by spaces and syllables by hyphens. Each syllable belongs to the next note
of the line above (rests and holds are skipped). Use `_` for a note that continues the previous
syllable.

```
| [G]1 . (3 1) | 3 . 2 |
L: ma-zing _ grace! how
```

## `arrangements.json`

Left-hand arrangements, the right-hand parts that go with them, and what is played around the
song: introductions, the key lift for a repeat, and endings. The app always adds one more
arrangement by itself, called **My style**: root, fifth, octave on the printed chords.

```json
{
  "intro": {
    "lastPhraseFrom": 13,
    "bridge": {
      "measures": [{ "right": "<1 4> <7, 2>", "left": "[D7sus4]<1' 4' 7'> [D7]<1' 3' 7'>" }]
    },
    "written": [
      {
        "id": "gospel",
        "name": "Gospel lead-in",
        "style": "Gospel",
        "summary": "One sentence that describes the introduction.",
        "measures": [
          {
            "right": "{mp}5 (. 6) (5 3)",
            "left": "[G](1 5) (1' 3') 5'",
            "note": "What happens here."
          }
        ]
      }
    ]
  },
  "modulation": {
    "measures": [{ "right": "<7, 2 4> .", "left": "[D7]<1' 3' 7'> ." }]
  },
  "endings": [
    {
      "id": "amen",
      "name": "Amen",
      "style": "Hymn",
      "summary": "One sentence that describes the ending.",
      "measures": [
        { "right": "<4 6 1'> . .", "left": "[C]<1 5 1'> . ." },
        { "right": "<3 5 1'> . .", "left": "[G]<1 5 1'> . ." }
      ]
    }
  ],
  "baseline": {
    "rightHand": {
      "fills": { "summary": "…", "measures": [{ "measure": 7, "right": "5 (7 2') (7 5)" }] }
    }
  },
  "arrangements": [
    {
      "id": "walking-bass",
      "name": "Walking bass",
      "level": "easy",
      "style": "Hymn",
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
      ],
      "rightHand": {
        "fills": {
          "summary": "One sentence that describes the fills.",
          "measures": [
            { "measure": 7, "right": "5 (6 7) (1' 7)", "note": "Fill: what the right hand adds." }
          ]
        },
        "accompaniment": {
          "summary": "One sentence that describes the texture.",
          "measures": [
            { "measure": 0, "right": "5," },
            { "measure": 1, "right": "5 . 6" }
          ]
        }
      }
    }
  ]
}
```

### Arrangements

| Field                | Meaning                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `id`                 | Unique identifier within the file                                                            |
| `name`               | Name shown in the left-hand menu                                                             |
| `level`              | `easy`, `intermediate`, or `advanced`; the menu groups arrangements by it                    |
| `style`              | Musical style shown as a tag: `Ballad`, `Hymn`, `Classical`, `Gospel`, `Jazz`, `Majestic`, … |
| `summary`            | One or two sentences shown under the name                                                    |
| `tips`               | Practice hints                                                                               |
| `patterns`           | Reusable ideas this arrangement introduces                                                   |
| `measures[].measure` | Printed measure number; `0` is the pickup measure                                            |
| `measures[].left`    | Left-hand notation for that measure (see below), without barlines                            |
| `measures[].note`    | Short explanation shown in the guide                                                         |
| `rightHand`          | Right-hand parts written for this left hand (see [Right-hand parts](#right-hand-parts))      |

A measure that is missing from the list falls back to the baseline.

The level also sets how far the hand may stretch before the checker warns: an octave for `easy`
and `intermediate`, a tenth for `advanced`.

### Left-hand notation

The left hand uses the same symbols as the melody, with one difference: **digits are chord
degrees, counted from the root of the current chord.**

| Degree          | Meaning                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1` `3` `5` `7` | Root, third, fifth, seventh of the chord (minor chords give a minor third; sus chords give the suspended note)                                     |
| `2` `4` `6`     | The ninth, eleventh, or sixth when the chord names it (`A9`, `Dm6`, `C13`); otherwise the note of the song's scale at that step, for passing notes |
| `'` and `,`     | Octave up or down from the root's register                                                                                                         |
| `#` and `b`     | Raise or lower the degree by a half step                                                                                                           |

The root of every chord sits in the octave from C2 to B2. `1` is that root, `1'` the root an
octave higher, `5,` the fifth below the root. When a chord has no seventh of its own, `7` is the
seventh that belongs to the song's key.

`<5 1'>` strikes the fifth and the octave together. The sheet draws stacked notes one above the
other, lowest at the bottom.

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

### Right-hand parts

Besides the printed melody, the player can choose two other things for the right hand:

| Mode               | Key             | What the right hand plays                                                             |
| ------------------ | --------------- | ------------------------------------------------------------------------------------- |
| **Melody**         | (nothing)       | The melody of `song.txt`, note for note. Always available.                            |
| **Melody + fills** | `fills`         | The melody, unchanged, plus notes that fill the places where it waits.                |
| **Accompaniment**  | `accompaniment` | Chords, rhythm, and fills for accompanying singers. The melody is left to the voices. |

The player picks the mode independently of the left hand, but **the notes are written per
arrangement**, under its `rightHand` entry. That pairing is deliberate:

- arrangements replace chords, so a right hand written for the printed chords would clash with
  a reharmonized left hand;
- a gap in the melody can be filled only once: when the right hand takes the fill, the left
  hand of that arrangement may have to step back, and the other way round;
- the right hand should speak the style of the left hand it goes with.

The baseline has no entry under `arrangements`, so its parts go under the top-level
`baseline.rightHand`. A mode that an arrangement does not write is greyed out in the menu and
the app plays the melody instead.

| Field                | Meaning                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `summary`            | One or two sentences shown in the guide                                                                               |
| `measures[].measure` | Printed measure number; `0` is the pickup measure                                                                     |
| `measures[].right`   | Right-hand notation for that measure, **relative to the key like the melody**, without barlines; `< >` stacks notes   |
| `measures[].left`    | Optional. Left-hand notation (chord degrees) that replaces the arrangement's own in this measure while the mode is on |
| `measures[].note`    | Short explanation shown in the guide                                                                                  |

**Fills** list only the measures they change; every other measure keeps the printed melody.
Each listed measure is written out in full: the melody notes at their printed positions, and
the added notes around them. A melody note may get notes underneath it (`<1 3>` under an A),
but it must stay the top note and stay on its beat.

The app then takes the line apart again. The melody stays on its row exactly as printed, so a
long note is still shown, and still sounds, for its full length; the notes the fill adds form
a second voice on a row of their own, marked `+`, right below it. In staff notation they are a
second layer on the staff of the melody. Nothing has to be written for this: a note of the
part that coincides with a melody note is the melody, and everything else is added.

**Accompaniment** lists every measure, the pickup included. A measure that is missing is a
measure of rest and is reported by the checker. The app shows the sung melody as a small row
(or staff) above the right hand, carries the lyrics there, and can play it as a soft guide tone
(**Voice** in the transport bar), so the accompaniment can be judged against the singing.

Use `left` where the hands trade roles: for example, the left hand of an arrangement fills a
gap with a run, and in _Melody + fills_ the right hand takes that run while the left hand goes
back to its plain pattern. End a replaced measure on the same chord as the measure it replaces.

**Fills ring on.** In playback the last note of a fill is not cut off at its written length: it
sounds until the right hand plays again, the way a pianist keeps it under the fingers or the
pedal. It is let go at the next chord change if it does not belong to the new chord. A fill
therefore connects to the melody by itself when it ends on a note of the chord that follows.
When it does not, as with a scale run that stops on a passing note, give it somewhere to land:
list the next measure as well and write a note of the new chord on a beat the melody leaves
empty. A rest of the melody may be filled; a melody note may not be changed.

```json
{ "measure": 14, "right": "4' (. 6) ((6 5) (4 3)) ((2 3) (4 5))" },
{ "measure": 15, "right": "6 (2' 1') (7 2') (6 7)", "note": "The run lands on F sharp." }
```

Introductions, the interlude, and endings are not affected by the right-hand mode: they are
instrumental and always carry their own right hand.

### Introduction

The app shows the introduction in its own block above the song and plays it first. The player
chooses between no introduction, the **Last phrase**, and any number of written introductions.

| Field                   | Meaning                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intro.lastPhraseFrom`  | Measure number where the closing phrase begins. The **Last phrase** introduction plays from there to the end, with whichever left hand is selected. Defaults to the last four measures. |
| `intro.written[]`       | Newly written introductions, listed in the menu in this order                                                                                                                           |
| `…written[].id`         | Unique identifier; `off` and `last-phrase` are reserved                                                                                                                                 |
| `…written[].name`       | Name shown in the menu and above the sheet                                                                                                                                              |
| `…written[].style`      | Musical style shown as a tag                                                                                                                                                            |
| `…written[].summary`    | One or two sentences shown in the menu                                                                                                                                                  |
| `…written[].measures[]` | One entry per measure, with both hands written out                                                                                                                                      |
| `…measures[].right`     | Right hand, relative to the key like the melody; may use `< >` and dynamic marks                                                                                                        |
| `…measures[].left`      | Left hand in chord degrees; its chord symbols are the chords shown                                                                                                                      |
| `…measures[].note`      | Short explanation shown in the guide                                                                                                                                                    |

Every measure of a written introduction must be full, except the last: together with the pickup
of the song it must make one full measure, so the song enters in time.

### Passages around the song

Besides the written introductions, a song has three more kinds of passage. All of them are
written like an introduction, measure by measure with both hands (`right`, `left`, `note`),
in the key of the song, and none of them depends on the selected left hand or right-hand mode.

| Entry                   | What it is                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `intro.bridge.measures` | Leads from the **Last phrase** introduction into the song                                           |
| `modulation.measures`   | The key lift: leads from the end of the song into its repeat in a higher key                        |
| `endings[]`             | Written endings, each with `id`, `name`, `style`, `summary`, and `measures`; `off` is a reserved id |

**The bridge.** The last phrase of a song ends on its home chord, which gives the singers no
cue. The bridge follows it: one or two measures that move to the dominant and stop there, so
the first note of the song is expected. It is played only after the _Last phrase_
introduction; a written introduction ends with its own lead-in. Like an introduction, its last
measure and the pickup must make one full measure.

**The key lift.** With **Repeat** switched on in the app, the song is played twice, the second
time a half step or a whole step higher, and the score continues below the first time through.
Between the two comes an interlude: the key lift, then the selected introduction once more
(with the bridge, after the last phrase), all in the new key. The key lift is written _in the
key of the song_ and played in the new key. Write the dominant seventh of the song's own key
with a line that rises into it: `[D7]` in a song in G sounds as E♭7 when the repeat is a half
step higher, which is exactly the chord that announces A♭. One or two measures are enough; the
last one lines up with the pickup, like an introduction. Without a key lift the repeat starts
directly in the new key.

**Endings.** An ending follows the last measure of the song (of the repeat, when there is one)
and closes the piece. The player chooses one in the app, or none. Write five, in different
styles:

| Style     | An ending that fits                                                                    |
| --------- | -------------------------------------------------------------------------------------- |
| Hymn      | An _Amen_: the four chord, then the home chord, each held for a measure                |
| Classical | The home chord rising in an arpeggio through two octaves, then a soft chord at the top |
| Gospel    | The minor four chord over the home bass, or a walk-up through a diminished chord       |
| Majestic  | Full chords in both hands, home, four over the same bass, home, and a high last chord  |
| Jazz      | The major seven chord a half step above home, sliding into the home chord with 6 and 9 |

Every measure of an ending is a full measure, the last one included. Its chords may simply be
held: the checker does not ask an ending to keep the beat.

**Short measures are completed.** A song with a pickup ends on a measure that is shorter by
the length of the pickup. That is right when the pickup follows, and wrong before anything
else. Whenever a bridge, a key lift, an introduction, or an ending follows such a measure, the
app holds its last notes to the end of the bar, so the meter stays intact. Nothing has to be
written for this, and passages after the song always start on a downbeat.

### The instrument

Arrangements are written for a **61-key keyboard**, which spans C2 to C7. No left-hand note may
lie below C2; the checker warns when one does. When the player transposes down in the app, a
note that would fall below C2 is played an octave higher instead.

### Filling the gaps

A gap is a place where the melody starts no new note for more than two beats: a long held note,
or a rest before the next phrase. With nothing but a repeated pattern underneath, a congregation
loses the beat there. Every arrangement must therefore:

- sound the left hand on every beat inside a gap, so the pulse stays audible;
- from the intermediate level on, move inside the gap (eighth notes or faster) instead of only
  repeating the beat;
- lead into the next entry of the melody, and use a different figure from one gap to the next.

With a right-hand part the two hands share that duty: between them they must sound every beat
and, from the intermediate level on, move. A _Melody + fills_ part must add at least one note
of its own in every gap; that is what it is for.

`npm run check` lists the gaps of each song and warns about any that are left unfilled. The end
of the song is not a gap.

### How the left hand is written on the sheet

The sheet shows the left hand in ordinary numbered notation relative to the key, not in chord
degrees. Its row has its own octave reference two octaves below the melody: for a song in F,
`1` on the melody row is F4 and `1` on the left-hand row is F2. A root-fifth-octave arpeggio on
the home chord therefore reads `1 5 1'`.

Transposing in the app moves every pitch and every chord symbol but leaves the digits alone,
because numbered notation is relative to "1".

The same files also drive the staff-notation view: the app converts the slots to note values,
ties, beams, and accidentals on a grand staff. Nothing extra has to be written for it.

## Checking

```bash
npm run check                       # every song
npm run check -- songs/amazing-grace
npm run check -- --dump             # also list the notes of every arrangement, part, and passage
```

Errors (wrong number of beats, unknown chord, malformed notation) fail the check. Warnings do
not, but each one deserves a look:

- a left-hand note below C2 (the lowest key of a 61-key keyboard) or above E4;
- a gap in the melody that the left hand does not fill (see above);
- stacked notes wider than an octave (a tenth for `advanced`);
- notes a third or less apart below C3;
- the left hand reaching up to the melody;
- a slash chord whose first left-hand note is not its bass;
- a chord that clashes by a half step with a melody note lasting a beat or more (name the
  extension, such as `Gm9` or `C13`, when the note is meant to be part of the chord);
- an introduction, a bridge, or a key lift whose last measure does not line up with the pickup;
- an ending with a measure that is not full (an error);
- a note marked with `?`.

Right-hand parts are checked together with the left hand they belong to:

- a fill that drops, moves, or covers a melody note;
- a gap in which a _Melody + fills_ part adds nothing, or in which neither hand marks a beat;
- an accompaniment measure that is not written;
- the hands crossing: a right-hand note at or below a left-hand note that sounds with it;
- right-hand notes wider than an octave, or above C7;
- a right-hand chord, or a single note of a beat or more, that lies a half step from a tone of
  the chord in force (short single notes pass freely);
- in an accompaniment, such a note a half step from what the singers are singing at that
  moment, or a held note that a new long note of the singers rubs against;
- a replaced left-hand measure that ends on another chord than the measure it replaces.

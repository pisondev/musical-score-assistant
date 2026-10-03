---
name: new-song
description: Add a song to the app from a photo or scan of a numbered-notation score. Transcribes the melody and chords into song.txt, reads the text and the tune and writes that reading down (analysis.md), then writes left-hand arrangements by level and style, the right-hand parts that go with them (fills and an accompaniment for singers), and what is played around the song (introductions, a bridge, a key lift for a repeat in a higher key, and endings) into arrangements.json, and checks everything. Use when the user provides a score image and asks for a song, a transcription, or left-hand or right-hand suggestions.
---

# Add a song from a printed score

Read `docs/song-format.md` before writing any file. It is the authority on syntax.

## 1. Set up the folder

- Use `songs/private/<book>-<number>-<title-in-kebab-case>/` (for example
  `pkj-184-nama-yesus-termulia`) for every hymnal song: hymnals are licensed and shown to the
  owner only. The repository is public and `songs/private/` is git-ignored.
- Only a song whose melody and text are both in the public domain (the author died more than
  70 years ago) goes directly under `songs/`, where every user sees it; name its folder after
  its title. When in doubt, use `songs/private/` and ask.
- `<book>` is the code of the hymnal in lower case: `kk` (Kidung Keesaan), `pkj` (Pelengkap
  Kidung Jemaat), `kj` (Kidung Jemaat), `kpj` (Kidung Pasamuwan Jawi). Take it from the page or
  from the name of the file; ask when neither says which hymnal it is.
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
2. Copy the header from the score: `title`, `book` (the hymnal code in capitals: `PKJ`),
   `number`, `key` (from "do = f"), `time`, `tempo`. A song from no hymnal names its
   `category` instead (`christian`, `classical`, `traditional`, `other`), and a classical
   piece its composer's surname as `subcategory`.
3. Place each chord before the note it is printed above. Chords printed over the second note of a
   beamed pair belong to that note: `(5 [C/E]4)`.
4. Add the first verse as `L:` lines, one syllable per note, `_` where a note continues a
   syllable.
5. Mark anything that cannot be read with certainty with `?` and tell the user which measures to
   compare against the page.
6. Run `npm run check -- <folder>`. Every measure must add up; fix errors before continuing.

Ask the user to listen with **Right** selected and confirm the melody before spending effort on
arrangements, unless they asked for everything in one go.

## 3. Read the song before arranging it

Nothing is arranged before the song has been read as a text set to music. This step comes
first every time: before the first arrangement of a new song, and before a revision of an old
one. An arrangement serves what the song says; a figure that suits its style and ignores the
song is a wrong note of its own kind.

Read every verse on the page, not only the one under the notes, and the whole tune. Then write
`analysis.md` in the song folder, half a page to a page, under these headings:

| Heading                             | What to work out                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Text**                            | What the song says and to whom: praise, prayer, confession, invitation, lament, thanks. Where it turns, which line carries the weight, how the last verse differs from the first. The season or the place in the service it belongs to.                                         |
| **Tune**                            | The range, the highest note and the word it falls on, steps or leaps, the rhythm that marks it, the phrases and which of them return, where the long notes and the rests are.                                                                                                   |
| **Harmony**                         | How fast the printed chords move, where a minor or a borrowed chord darkens a word, where the cadences are.                                                                                                                                                                     |
| **Character**                       | The mood to build, in a few words (quiet trust, awe, joy that marches), the tempo that carries it, where the climax is, and where the song should be still.                                                                                                                     |
| **What the arrangements should do** | The plan for the dynamics. What kind of fill each gap needs in view of the words sung there: one that drives on, or one that comes to rest. What each of the five styles should take from this song and what it must leave out. The character of the introductions and endings. |

Quote lines of the text in their own language and write the rest in English.
`songs/amazing-grace/analysis.md` is an example.

Everything written afterwards follows the reading:

- **Dynamics.** Add them to `song.txt` (`{mp}`, `{<}`, `{f}` and so on) where the reading puts
  them: the climax on the line that carries the weight, stillness where the text turns inward.
  Printed hymnals rarely give dynamics, so note in a comment that they are an interpretation.
- **Styles bend to the song.** A lament gets no fanfares and a march no dreamy arpeggios. When
  a style does not suit the song as it stands, write its quietest or its broadest form, and
  say so in the `summary`.
- **Fills speak with the words.** A gap after a question or a half cadence is filled with
  something that leads on; a gap after an arrival with something that settles.

`npm run check` says for every song whether its reading is written. A song without
`analysis.md` gets one before its arrangements are touched.

## 4. Write `arrangements.json`

Write these five arrangements unless asked otherwise, in this order. Keep the ids so the menu
is consistent across songs; the `level` decides the column and the `style` is the tag the
player sees.

| id             | level        | style        | What it teaches                                                             |
| -------------- | ------------ | ------------ | --------------------------------------------------------------------------- |
| `alberti-bass` | intermediate | Classical    | Broken chords, lowest-highest-middle-highest, staying in one hand position. |
| `gospel`       | intermediate | Gospel       | Octave bass, walk-ups, passing diminished chords, the minor four chord.     |
| `jazz`         | advanced     | Jazz         | Shell voicings (`<1 7 3'>`), two-five-one chains, tritone substitution.     |
| `new-chords`   | intermediate | Contemporary | Some chords replaced: minor sevenths, IV over V, an Amen ending.            |
| `majestic`     | advanced     | Majestic     | Octave in the bass, then a full chord; broad and loud for a congregation.   |

**Quality before quantity.** The first three are the player's favourites, best liked first:
the Alberti bass, gospel, and the shell voicings of the jazz version. Write them first and give
them the most care. Five versions that are each worth practising serve the player better than
a long menu: put the effort into fills that belong to this song, into voice leading, and into
reading the dump, not into more variety.

Do not write `one-step-further` (Ballad) or `walking-bass` (Hymn) for a new song; the player
no longer needs them. Songs that have them keep them. Other styles are welcome when the user
asks for them; choose the level by how hard the left hand is to play, not by how unusual the
chords are.

Then write the introductions under `intro`:

- `lastPhraseFrom`: the measure number where the closing phrase of the song begins.
- `written`: three or four introductions in different styles (for example gospel, classical,
  majestic, jazz), each with an `id`, a `name`, a `style`, and a `summary`. Four measures or so,
  with both hands written out (`right` relative to the key, `left` in chord degrees). Give each
  a shape: a line that rises and falls, a bass that moves, and an ending that lets the song
  enter. Every measure must be full except the last, which together with the pickup of the song
  must make one full measure.

After the introductions, write the passages around the song. `docs/song-format.md` describes
them under "Passages around the song"; all of them are written like an introduction, with both
hands, in the key of the song.

- **The bridge** (`intro.bridge.measures`): one or two measures played after the _Last phrase_
  introduction. Move from the home chord to the dominant, suspended and then resolved, and stop
  there, so the first note of the song is expected. The last measure and the pickup make one
  full measure.
- **The key lift** (`modulation.measures`): one or two measures that lead from the end of the
  song into its repeat in a higher key. Write the dominant seventh of the song's own key with
  a line that rises into it; the app plays it in the new key, where it is exactly the chord
  that announces that key. The last measure lines up with the pickup.
- **Five endings** (`endings`), with the ids `amen`, `classical`, `gospel`, `majestic`, and
  `jazz`, each with a `name`, a `style`, and a `summary`:

  | id          | style     | What to write                                                                          |
  | ----------- | --------- | -------------------------------------------------------------------------------------- |
  | `amen`      | Hymn      | The four chord, then the home chord, each held for a measure                           |
  | `classical` | Classical | The home chord rising in eighths through two octaves, then a soft chord at the top     |
  | `gospel`    | Gospel    | The minor four chord over the home bass, or a walk-up through a diminished chord       |
  | `majestic`  | Majestic  | Full chords in both hands: home, four over the same bass, home, and a high last chord  |
  | `jazz`      | Jazz      | The major seven chord a half step above home, then the home chord with sixth and ninth |

  Every measure of an ending is full. Vary the endings from song to song: when the last
  measures of the song already are an Amen, do not write the same figure again as an ending.

The app completes a last measure that was cut short for the pickup whenever one of these
passages follows it, so they all start on a downbeat.

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
     | Classical    | A scale run up and back, the Alberti figure in double time, a sweep        |
     | Gospel       | An octave walk-up through a diminished chord, a triplet roll, a bass run   |
     | Jazz         | A walking bass between shells, a chord answered off the beat, a turnaround |
     | Contemporary | A neighbour chord over the same bass (IV over I), a suspension             |
     | Majestic     | Rising chord positions, a drum roll of repeated chords, octave walk-ups    |

   - **lead into the next entry**: put a clear bass note or chord on the beat just before the
     melody returns, and let the line point at the next chord;
   - use a **different fill in each gap** of the same arrangement.
3. Mention each fill in the `note` of its measure, starting with "Fill:", and list the fill
   figures under `patterns`.

### Right-hand parts

Once the left hands are written and clean, give every arrangement three right-hand parts under
`rightHand` (`harmony`, `fills`, `accompaniment`), and the baseline the same three under the
top-level `baseline.rightHand`. The
player chooses the mode freely, but the notes are written per arrangement on purpose: they use
its chords, speak its style, and share the gaps with its left hand. The right hand is written
relative to the key, like the melody.

**Chords under the melody** (`harmony`): the player does not want a right hand that sounds
like one finger. This part thickens the melody in the modes that play it.

- List the measures that get a chord, each written as the melody of that measure with some
  notes turned into stacks, melody on top: `<3, 5, 1> . (3 1)`.
- Chord the strong points: a downbeat, a note of two beats or more, the first note after a
  rest, a chord change under a note of a beat or more, and the last note. Leave runs and short
  notes single. In a majestic arrangement chord every note of a beat or more.
- Take two notes from the chord of that arrangement at that moment (the third and the seventh
  in jazz, three notes in majestic). Keep them a third or more below the melody, within an
  octave of it, and above the left hand for as long as the chord sounds.
- Skip a melody note that rubs against the chord.
- Roll the long chords with `~`: from two beats in contemporary, classical, and jazz; from
  three beats in the baseline and in gospel; never in majestic.
- Add nothing between melody notes; that is what the fills are for.

**Melody + fills** (`fills`): the printed melody stays; the right hand adds notes where it
waits.

- List only the measures that change: every gap, and the final long note if it helps.
- Copy the measure from `song.txt` and add notes around the melody. Never move, drop, or cover
  a melody note; other notes may be stacked beneath it (`<1 3>`).
- Choose the figure by style:

  | Style        | Right-hand fills that fit                                                 |
  | ------------ | ------------------------------------------------------------------------- |
  | Basic        | Single notes: an arch through the chord, a turn, a climb                  |
  | Classical    | Scale runs and broken chords in sixteenths, a turn around one note        |
  | Gospel       | Thirds that climb with a walk-up, a blue-note slide, a triplet roll       |
  | Jazz         | Arpeggios that follow the changes, chords placed off the beat             |
  | Contemporary | The added second, a suspended note that resolves with the left hand       |
  | Majestic     | Full chords rising through their positions, both hands in the same rhythm |

- Where the left hand of the arrangement already fills the gap with a busy figure, either
  write a right hand that goes with it (thirds on each bass step, a chord between bass notes,
  the same rhythm in both hands) or add `left` to the measure so the left hand returns to its
  plain pattern and the fill moves to the right hand. Never set a triplet in one hand against
  eighths in the other.
- Use a different figure in each gap.
- **Let every fill arrive.** In playback the last note of a fill rings until the right hand
  plays again, but only if it belongs to the chord that follows. End a fill on such a note.
  When a run ends on a passing note instead, list the next measure too and write a landing
  note of the new chord on a beat the melody leaves empty (a rest may be filled; a melody
  note may not be changed). A run that stops at the barline with nowhere to go sounds cut
  off.

**Accompaniment** (`accompaniment`): for accompanying singers; the right hand does not play
the tune.

- Write every measure. In the pickup, double the melody so the singers find their first notes.
- Give each arrangement one texture and keep it:

  | id             | Right-hand texture                                                    |
  | -------------- | --------------------------------------------------------------------- |
  | baseline       | Sustained three-note chords, one per harmony                          |
  | `alberti-bass` | A second voice in thirds and sixths, in half notes                    |
  | `gospel`       | Chords on the backbeat; a chord on every step of a walk-up            |
  | `jazz`         | Rootless voicings (third, seventh, ninth) on one and the "and" of two |
  | `new-chords`   | Syncopated chords with an added second                                |
  | `majestic`     | Four-note chords, long, short-long                                    |

- Stay above the left hand, roughly from E4 to A5, and clear of the singers: no chord tone a
  half step from the melody note that is sung at that moment. Leave such a tone out.
- **Share the gaps.** In about half of them the right hand takes the fill (with `left` when
  the fill of the left hand would collide); in the others it holds and lets the left hand
  speak. Under the baseline the right hand fills every gap, because that left hand never does.
- End on a held chord.

Explain each fill in the `note` of its measure, starting with "Fill:", say in a `note` on
measure 1 of an accompaniment what the texture is, and give each part a `summary`.

Guidelines:

- **Left hand moves when the melody rests, and rests when the melody moves.** Fills under long
  melody notes; plain quarter notes under busy melody.
- **Write for a 61-key keyboard.** The lowest key is C2: never write a left-hand note below it,
  not even as the lower half of an octave.
- **Keep it playable.** Stacked notes span at most an octave (a tenth for `advanced`). Stay
  between C2 and E4 and below the melody. Avoid thirds below C3. The player comes from root,
  fifth, octave: an intermediate version should be within reach after a short practice session.
- **Check every new chord against the melody** on the beats where it sounds. A melody note that
  lasts a beat or more must not sit a half step from a chord tone. When the note is meant to be
  a ninth or thirteenth, name it in the symbol (`Gm9`, `C13`).
- **Name extensions you use.** The degrees `2`, `4` and `6` follow the chord symbol when it names
  them (`Dm6`, `A9`); otherwise they follow the key of the song.
- **Slash chords** need their bass as the first left-hand note of the chord (`[C/E]3 ...`).
- **Reuse shapes.** An arrangement that introduces two or three ideas and repeats them is easier
  to learn than one that changes every measure.
- **Roll the chords that should bloom.** Write `~` in front of a stack to roll it: a long
  chord at the end of a phrase, the chords of an Amen, a final chord, a chord wider than the
  hand. Leave rhythmic chords solid (a backbeat, a fanfare, a drum roll).
- **Explain.** Give every measure that departs from the baseline a one-sentence `note` saying
  what changed and why it works. List each new idea under `patterns` with a name, its notation,
  and when to use it. Add two or three `tips` for practising.
- Write all text in plain English. Describe pitches by letter name or scale degree.

## 5. Verify

1. Run `npm run check -- <folder> --dump`.
2. Read the dump measure by measure and confirm the pitches are the ones intended; the degrees
   are relative to the chord root, so slash-chord basses are easy to get wrong.
3. Each arrangement is followed by the lines `right hand, chords under the melody`,
   `right hand, melody + fills`, and `right hand, accompaniment`. All three must be there for
   every arrangement, "My style" included.
4. Resolve every error and every warning. A warning may stay only if it is deliberate, and then
   say so in the hand-over.

## 6. Hand over

Tell the user:

- where the song is and how to open it (`npm run dev`, then pick the song);
- which notes were uncertain in the transcription;
- how the song was read, in three or four sentences: what it says, the mood, where the climax
  is, so that a misreading can be corrected before anything is practised;
- what each arrangement does in one line, and any chord that was replaced;
- how each gap is filled in each arrangement, in a line or two;
- what the right hand does in **Melody + fills** and in **Accompaniment**, and that **Voice**
  lets them hear an accompaniment together with the sung melody;
- what the bridge, the key lift, and each ending do, and that **Repeat** plays the song a
  second time a half or whole step higher;
- that the dynamics, the written introductions, the bridge, the key lift, the endings, and the
  right-hand parts are your own suggestions;
- that the three dots on a measure that was clicked (or a right click, or a long press on a
  phone) take a note on it, and that those
  notes are read when the song is revised.

When the song is revised later, run `npm run notes:pull` (the player writes notes on the
public site, where the server keeps them), then read `analysis.md` and `notes.json` in its
folder first. Each
note names the measure and the arrangement it is about; when a note changes how the song is
understood, correct the reading as well.

Do not commit or push unless the user asks. A private song reaches the public site only with
`npm run songs:push`; offer it in the hand-over and run it when the user agrees.

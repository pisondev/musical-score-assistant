# Melody transcription

## Source and scope

"Saksi Kasih-Mu", credited to Putu Edo Bestuana, is transcribed from four references supplied
by its composer: `verse-sample-1.m4a`, `verse-sample-2.m4a`, `reff-sample-1.m4a`, and
`reff-sample-2.m4a`. The composer confirmed permission to publish the song. The original
recordings remain under `.local/incoming/saksi-kasih-mu/raw/`, outside version control.

This revision contains the melody only. No lyric text was supplied. The earlier speculative
chords and arrangements are removed from playback: `baseline.leftHand` is `empty` and there
are no alternative arrangements. The numbered score, staff score, and MIDI use the same
parsed `song.txt`, with no additions to its melody.

## Method and evidence

The first transcription selected the strongest spectral peak above 240 Hz in a 512 ms window.
That cutoff excludes A3 and G3, allowing their harmonics to be mistaken for melody notes.
The long window also blurs adjacent attacks, and detecting pitch changes alone misses
repeated strikes of the same note. Passing the notation checker did not establish fidelity
to the recordings.

The revision uses an 8 ms analysis step, detects attacks with spectral flux, and compares
the spectral fundamentals against pYIN pitch estimates over 100-900 Hz. Both takes of each
section are aligned note by note. A spectral-flux peak during a ringing note is not counted
as a new strike when the waveform, pitch trajectory, and other take do not support one.
Conversely, the repeated notes shared by both takes are retained.

`transcription.csv` records every melody attack, its absolute MIDI pitch, measure, one-based
beat position, notated duration, and timestamp in each source take. Source timestamps locate
the attacks to approximately 20 ms; they are not an instruction to reproduce the recordings'
free timing. `saksi-kasih-mu-melody.mid` is exported from the app's core MIDI writer and is
checked against this table.

## Pitches and phrases

- **Verse:** 43 attacks, G3-G4. The opening is E4, E4, D4, E4, G4, C4. The A notes at the
  ends of the opening phrases are A3, not A4. G3 occurs in measures 3, 6, and 7; the G4
  attacks in measures 1 and 5 stay in their higher register. The F4-E4-D4-C4-D4 phrase in
  measure 4 and the F4-E4-D4-C4-C4 close in measure 8 retain their short-long rhythm.
- **Refrain:** 46 attacks, C4-F5. The opening is C4, E4, G4, A4, G4, A4, E5, D5. C4-E4-G4
  is the pickup after leading rests in measure 9, and the first A4 starts measure 10 on beat one.
  The following G4 phrase starts measure 11. Measure 12 opens with F4-E4-F4 before C5;
  the second F4 was absent from the earlier transcription. Measure 13 repeats the pickup as
  G4-A4-G4 (`5-6-5`), so measure 14 opens with the A4-G4-A4-E5-D5 figure of measure 10.
  Measure 15 opens with the E5-F5-E5-D5-C5 high phrase, the shape of measure 11 a sixth
  higher, and the repeated C5 attacks near the close are preserved.

The pitch names above refer to sounding pitch: middle C is C4 (MIDI 60). `octave: 4` pins
the numbered notation to this register instead of allowing automatic octave selection.

## Meter, tempo, and editorial choices

The score uses C major and the composer's suggested 4/4. Attacks are written on a
sixteenth-note grid, including dotted eighths, ties over beats and barlines, and repeated
notes. The verse occupies measures 1-8 and the refrain measures 9-17, including its entry bar.
The composer clarified the join in two follow-up notes:

- Measure 8 closes with F4-E4-D4-C4-C4 (`4-3-2-1-1`). The last C4 lasts half a beat from
  beat 3, followed by a genuine silent rest for the remaining 1.5 beats. It is not tied
  across the pause.
- Measure 9 belongs to the refrain. It begins with 2.5 beats of rest and contains only the
  three-eighth C4-E4-G4 (`1-3-5`) pickup on beats 3.5, 4, and 4.5. The first A4 (`6`)
  therefore opens measure 10. There are four silent beats between the verse's final C4
  release and the refrain's first C4 attack.
- The G4 (`5`) previously anticipated the next bar by half a beat. D5 (`2'`) now holds for
  two full beats, from beat 3 of measure 10 to its barline, and G4 begins measure 11 on beat
  one. G4 still lasts half a beat: its entry, rather than its note value, is corrected.
  The following notes retain their internal spacing and move half a beat later together.
- The composer's notes on measures 11-15 apply the same rule to the rest of the refrain.
  F4 (`4`) moves from beat 4.5 of measure 11 to the downbeat of measure 12, and C5 before
  it holds for two beats. The G4 (`5`) that ended measure 12 therefore opens measure 13 and
  holds for two and a half beats. Measure 13 is a second refrain entry: G4-A4-G4 (`5-6-5`)
  takes the place of `1-3-5` on beats 3.5, 4, and 4.5, and A4 (`6`) opens measure 14 like
  measure 10. Measure 14 closes differently, with D5 for one and a half beats and the C5-D5
  sixteenths that lead to E5 on the downbeat of measure 15.
- From measure 15 the closing C5s were re-quantized against the anchor of C5 on beat 3:
  both takes place the following attacks about a quarter beat later than the earlier grid,
  at 1.61, 1.91, 2.43, 2.73, 3.89, 4.40, 4.71, 5.49, and 6.00 beats (mean of the two takes,
  scaled to the final C5). C5 now opens measure 16 and the final C5 opens measure 17. The
  takes differed on the repeated C5 at the end of measure 15 (1.61 beats); the composer
  confirmed it as a sixteenth on beat 4.75, so the C5 on beat 3 holds for one and three
  quarter beats.

The source files are separate takes, so the composer supplies the silent verse-to-refrain
join and the corrected metrical entry points. The score has 17 full measures (68 beats).

The takes do not keep one fixed tempo. Before the composer's timing corrections, fits gave
65.46 and 72.43 BPM for the verse takes, and 68.44 and 70.70 BPM for the refrain takes.
The fixed playback tempo is 68 BPM. That earlier alignment had residuals of approximately
138/148 ms for the verse and 62/99 ms for the refrain. The latest rests and the extended held notes
follow the composer's written corrections; they do not claim to reproduce the free timing
of the separate recordings. Short notes were not all rounded to eighth notes.

With the corrected bar placement, the final C5 enters on the downbeat of measure 17. Letting
it ring through that bar remains an editorial close: four beats, keeping the song at 17 full
measures. Recording tail length does not determine an exact final note value.
No extra final attack, fill, introduction, key change, harmony, or lyric is inferred from
that tail. Source timestamps and all 89 pitches remain unchanged by these timing corrections.

## Musical reading

The title suggests Christian worship, but a reading of the words must wait for the lyrics.
The verse alternates a middle-register line with low A3 and G3 responses and closes on C4.
The refrain rises into the C5 register and reaches F5 before descending to its final C5.
Future arrangements should preserve these register changes, repeated notes, and
syncopations. This pass does not prescribe their texture or harmony.

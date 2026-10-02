import { chordPitchClasses, parseChord } from './chord';
import { findGaps, leftHandOnsets } from './gaps';
import { KEYBOARD_LOWEST, LEFT_HAND_HIGHEST } from './keyboard';
import { formatNoteName, mod, pitchClass } from './notes';
import { buildNoteEvents, measureIndexAt } from './playback';
import { beatTicks } from './time';
import type { Arrangement, Issue, NoteEvent, Song } from './types';

/** Below C3, notes a third or less apart sound muddy. */
const MUDDY_BELOW = 48;
const MUDDY_INTERVAL = 4;

/** Widest stretch between notes struck together: an octave, or a tenth for advanced players. */
const SPAN_LIMIT = { easy: 12, intermediate: 12, advanced: 16 } as const;

function soundingAt(events: NoteEvent[], tick: number): NoteEvent[] {
  return events.filter((event) => event.tick <= tick && tick < event.tick + event.duration);
}

/**
 * Checks the places where the melody waits. The left hand must mark every
 * beat there, so the congregation can feel when to come in; from the
 * intermediate level on it must also move, not just repeat the pulse.
 */
function checkGaps(song: Song, arrangement: Arrangement, issues: Issue[]): void {
  const beat = beatTicks(song.meta.time);
  const onsets = leftHandOnsets(song, arrangement.measures);
  const needsMovement = arrangement.level !== 'easy';

  for (const gap of findGaps(song)) {
    const silent = gap.beats.find((tick) => !onsets.includes(tick));
    if (silent !== undefined) {
      const measure = measureIndexAt(song, silent);
      const position = (silent - song.measures[measure].startTick) / beat + 1;
      issues.push({
        severity: 'warning',
        message: `The melody waits here, but the left hand is silent on beat ${position}; mark every beat so the pulse stays audible.`,
        measure,
        hand: 'left',
      });
      continue;
    }
    if (!needsMovement) continue;

    const moves = gap.beats.some(
      (tick) => onsets.filter((onset) => onset >= tick && onset < tick + beat).length >= 2,
    );
    if (!moves) {
      issues.push({
        severity: 'warning',
        message:
          'The melody waits here and the left hand only repeats the beat; add a fill that moves and leads to the next entry.',
        measure: gap.measure,
        hand: 'left',
      });
    }
  }
}

/**
 * Checks that an arrangement is playable and fits the melody. Everything
 * reported here is a warning: the arrangement still plays, but deserves a look.
 */
export function validateArrangement(song: Song, arrangement: Arrangement): Issue[] {
  const issues: Issue[] = [];
  const beat = beatTicks(song.meta.time);
  const melody = buildNoteEvents(song, arrangement).filter((event) => event.hand === 'right');
  const spanLimit = SPAN_LIMIT[arrangement.level];

  song.measures.forEach((measure, index) => {
    const part = arrangement.measures[index];
    const warn = (message: string) =>
      issues.push({ severity: 'warning', message, measure: index, hand: 'left' });

    for (const slot of part.slots) {
      if (slot.kind !== 'note' || slot.pitches.length === 0) continue;
      const lowest = slot.pitches[0].midi;
      const highest = slot.pitches[slot.pitches.length - 1].midi;

      if (lowest < KEYBOARD_LOWEST) {
        warn('Left-hand note lies below C2, the lowest key of a 61-key keyboard.');
      }
      if (highest > LEFT_HAND_HIGHEST) {
        warn('Left-hand note lies above E4, where it gets in the way of the melody.');
      }
      if (highest - lowest > spanLimit) {
        warn(`Stacked notes span ${highest - lowest} semitones, wider than the hand reaches.`);
      }
      for (let i = 1; i < slot.pitches.length; i += 1) {
        const gap = slot.pitches[i].midi - slot.pitches[i - 1].midi;
        if (gap <= MUDDY_INTERVAL && slot.pitches[i - 1].midi < MUDDY_BELOW) {
          warn('Notes a third or less apart below C3 sound muddy; open the voicing.');
        }
      }

      const tick = measure.startTick + slot.start;
      const melodyNotes = soundingAt(melody, tick);
      if (melodyNotes.some((event) => event.midi <= highest)) {
        warn('Left hand reaches up to the melody; move it lower.');
      }
    }

    part.chords.forEach((mark, markIndex) => {
      const chord = parseChord(mark.symbol);
      if (!chord) return;
      const spanEnd = part.chords[markIndex + 1]?.start ?? measure.length;

      if (chord.bass) {
        const first = part.slots.find(
          (slot) => slot.kind === 'note' && slot.start >= mark.start && slot.start < spanEnd,
        );
        if (first && first.pitches.length > 0) {
          if (mod(first.pitches[0].midi, 12) !== pitchClass(chord.bass)) {
            warn(`Chord [${mark.symbol}] expects ${formatNoteName(chord.bass)} in the bass.`);
          }
        }
      }

      const tick = measure.startTick + mark.start;
      const tones = chordPitchClasses(chord);
      for (const event of melody) {
        if (event.tick !== tick || event.duration < beat) continue;
        const melodyClass = mod(event.midi, 12);
        if (tones.includes(melodyClass)) continue;
        const clashes = tones.some((tone) => {
          const distance = mod(melodyClass - tone, 12);
          return distance === 1 || distance === 11;
        });
        if (clashes) {
          issues.push({
            severity: 'warning',
            message: `The melody note clashes with chord [${mark.symbol}].`,
            measure: index,
            hand: 'left',
          });
        }
      }
    });
  });

  checkGaps(song, arrangement, issues);
  return issues;
}

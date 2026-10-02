import { chordPitchClasses, parseChord } from './chord';
import { formatNoteName, mod, pitchClass } from './notes';
import { buildNoteEvents } from './playback';
import { beatTicks } from './time';
import type { Arrangement, Issue, NoteEvent, Song } from './types';

/** Playable range of the left hand: A1 to E4. */
const LEFT_LOWEST = 33;
const LEFT_HIGHEST = 64;

/** Below C3, notes a third or less apart sound muddy. */
const MUDDY_BELOW = 48;
const MUDDY_INTERVAL = 4;

/** Widest stretch between notes struck together: an octave, or a tenth for advanced players. */
const SPAN_LIMIT = { easy: 12, intermediate: 12, advanced: 16 } as const;

function soundingAt(events: NoteEvent[], tick: number): NoteEvent[] {
  return events.filter((event) => event.tick <= tick && tick < event.tick + event.duration);
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

      if (lowest < LEFT_LOWEST || highest > LEFT_HIGHEST) {
        warn('Left-hand note lies outside the comfortable range (A1 to E4).');
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

  return issues;
}

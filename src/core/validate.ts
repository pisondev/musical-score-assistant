import { chordAt, chordTimeline } from './arrangement';
import { chordPitchClasses, normalizeChordSymbol, parseChord } from './chord';
import { findGaps, leftHandOnsets, noteOnsets, type Gap } from './gaps';
import { KEYBOARD_HIGHEST, KEYBOARD_LOWEST, LEFT_HAND_HIGHEST } from './keyboard';
import { formatNoteName, mod, pitchClass, toneToText } from './notes';
import { buildWrittenNotes, measureIndexAt } from './playback';
import { composeRightHand } from './right-hand';
import { beatTicks } from './time';
import type {
  Arrangement,
  ArrangementMeasure,
  Hand,
  Issue,
  Level,
  Measure,
  NoteEvent,
  RightHandPart,
  Song,
} from './types';

/** Below C3, notes a third or less apart sound muddy. */
const MUDDY_BELOW = 48;
const MUDDY_INTERVAL = 4;

/** Widest stretch between notes struck together: an octave, or a tenth for advanced players. */
const SPAN_LIMIT = { easy: 12, intermediate: 12, advanced: 16 } as const;

/** The right hand also holds a melody or a line on top, so it stays within an octave. */
const RIGHT_SPAN_LIMIT = 12;

function soundingAt(events: NoteEvent[], tick: number): NoteEvent[] {
  return events.filter((event) => event.tick <= tick && tick < event.tick + event.duration);
}

/** True when two pitches are a half step apart, in any octave. */
function isHalfStep(a: number, b: number): boolean {
  const distance = mod(a - b, 12);
  return distance === 1 || distance === 11;
}

/** How the gap warnings name what is missing, for one hand or for both. */
interface GapWording {
  hand: Hand;
  silent: (beat: number) => string;
  still: string;
}

const LEFT_ALONE: GapWording = {
  hand: 'left',
  silent: (beat) =>
    `The melody waits here, but the left hand is silent on beat ${beat}; mark every beat so the pulse stays audible.`,
  still:
    'The melody waits here and the left hand only repeats the beat; add a fill that moves and leads to the next entry.',
};

const BOTH_HANDS: GapWording = {
  hand: 'right',
  silent: (beat) =>
    `The melody waits here, but neither hand plays on beat ${beat}; mark every beat so the pulse stays audible.`,
  still:
    'The melody waits here and the hands only repeat the beat; add a fill that moves and leads to the next entry.',
};

/**
 * Checks the places where the melody waits. Something must mark every beat
 * there, so the congregation can feel when to come in; from the intermediate
 * level on it must also move, not just repeat the pulse. `onsets` are the
 * ticks at which the hands in question strike a note.
 */
function checkGaps(
  song: Song,
  gaps: Gap[],
  onsets: number[],
  needsMovement: boolean,
  wording: GapWording,
  issues: Issue[],
): void {
  const beat = beatTicks(song.meta.time);

  for (const gap of gaps) {
    const silent = gap.beats.find((tick) => !onsets.includes(tick));
    if (silent !== undefined) {
      const measure = measureIndexAt(song, silent);
      const position = (silent - song.measures[measure].startTick) / beat + 1;
      issues.push({
        severity: 'warning',
        message: wording.silent(position),
        measure,
        hand: wording.hand,
      });
      continue;
    }
    if (!needsMovement) continue;

    const moves = gap.beats.some(
      (tick) => new Set(onsets.filter((onset) => onset >= tick && onset < tick + beat)).size >= 2,
    );
    if (!moves) {
      issues.push({
        severity: 'warning',
        message: wording.still,
        measure: gap.measure,
        hand: wording.hand,
      });
    }
  }
}

/**
 * Checks that the left hand of one measure is playable and stays out of the
 * way. `upper` holds the notes of the right hand, named `upperName` in the
 * warning.
 */
function checkLeftSlots(
  measure: Measure,
  part: ArrangementMeasure,
  level: Level,
  upper: NoteEvent[],
  upperName: string,
  issues: Issue[],
): void {
  const warn = (message: string) =>
    issues.push({ severity: 'warning', message, measure: measure.index, hand: 'left' });

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
    if (highest - lowest > SPAN_LIMIT[level]) {
      warn(`Stacked notes span ${highest - lowest} semitones, wider than the hand reaches.`);
    }
    for (let i = 1; i < slot.pitches.length; i += 1) {
      const gap = slot.pitches[i].midi - slot.pitches[i - 1].midi;
      if (gap <= MUDDY_INTERVAL && slot.pitches[i - 1].midi < MUDDY_BELOW) {
        warn('Notes a third or less apart below C3 sound muddy; open the voicing.');
      }
    }

    const tick = measure.startTick + slot.start;
    if (soundingAt(upper, tick).some((event) => event.midi <= highest)) {
      warn(`Left hand reaches up to ${upperName}; move it lower.`);
    }
  }
}

/** Checks that every slash chord of a measure gets its bass note first. */
function checkSlashBass(measure: Measure, part: ArrangementMeasure, issues: Issue[]): void {
  part.chords.forEach((mark, markIndex) => {
    const chord = parseChord(mark.symbol);
    if (!chord?.bass) return;
    const spanEnd = part.chords[markIndex + 1]?.start ?? measure.length;
    const first = part.slots.find(
      (slot) => slot.kind === 'note' && slot.start >= mark.start && slot.start < spanEnd,
    );
    if (!first || first.pitches.length === 0) return;
    if (mod(first.pitches[0].midi, 12) !== pitchClass(chord.bass)) {
      issues.push({
        severity: 'warning',
        message: `Chord [${mark.symbol}] expects ${formatNoteName(chord.bass)} in the bass.`,
        measure: measure.index,
        hand: 'left',
      });
    }
  });
}

/**
 * Checks that an arrangement is playable and fits the melody. Everything
 * reported here is a warning: the arrangement still plays, but deserves a look.
 */
export function validateArrangement(
  song: Song,
  arrangement: Arrangement,
  /** False for music that may stand still, such as the held chords of an ending. */
  keepsPulse = true,
): Issue[] {
  const issues: Issue[] = [];
  const beat = beatTicks(song.meta.time);
  const melody = buildWrittenNotes(song, arrangement).filter((event) => event.track === 'right');

  song.measures.forEach((measure, index) => {
    const part = arrangement.measures[index];
    checkLeftSlots(measure, part, arrangement.level, melody, 'the melody', issues);
    checkSlashBass(measure, part, issues);

    for (const mark of part.chords) {
      const chord = parseChord(mark.symbol);
      if (!chord) continue;
      const tick = measure.startTick + mark.start;
      const tones = chordPitchClasses(chord);
      for (const event of melody) {
        if (event.tick !== tick || event.duration < beat) continue;
        const melodyClass = mod(event.midi, 12);
        if (tones.includes(melodyClass)) continue;
        if (tones.some((tone) => isHalfStep(melodyClass, tone))) {
          issues.push({
            severity: 'warning',
            message: `The melody note clashes with chord [${mark.symbol}].`,
            measure: index,
            hand: 'left',
          });
        }
      }
    }
  });

  if (keepsPulse) {
    checkGaps(
      song,
      findGaps(song),
      leftHandOnsets(song, arrangement.measures),
      arrangement.level !== 'easy',
      LEFT_ALONE,
      issues,
    );
  }
  return issues;
}

/**
 * Checks a right-hand part together with the left hand it belongs to: that
 * the hands stay clear of each other, that the right hand fits the chords and
 * the sung melody, that fills leave the melody intact, and that the gaps of
 * the melody are filled by the two hands between them.
 */
export function validateRightHand(
  song: Song,
  arrangement: Arrangement,
  part: RightHandPart,
): Issue[] {
  const issues: Issue[] = [];
  const beat = beatTicks(song.meta.time);
  const composed = composeRightHand(song, arrangement, part);
  const notes = buildWrittenNotes(composed.song, composed.arrangement);
  const right = notes.filter((event) => event.track === 'right');
  const left = notes.filter((event) => event.track === 'left');
  const melody = buildWrittenNotes(song, arrangement).filter((event) => event.track === 'right');

  const timeline = (parts: ArrangementMeasure[]) =>
    chordTimeline(
      song.measures.map((measure, index) => ({
        startTick: measure.startTick,
        chords: parts[index].chords,
      })),
    );
  const harmony = timeline(composed.arrangement.measures);
  const ownHarmony = timeline(arrangement.measures);

  part.measures.forEach((written, index) => {
    if (!written) return;
    const measure = composed.song.measures[index];
    const leftPart = composed.arrangement.measures[index];
    const warn = (message: string, hand: Hand = 'right') =>
      issues.push({ severity: 'warning', message, measure: index, hand });
    const beatOf = (tick: number) => (tick - measure.startTick) / beat + 1;

    checkLeftSlots(measure, leftPart, arrangement.level, right, 'the right hand', issues);
    if (written.left) checkSlashBass(measure, leftPart, issues);

    const sung = song.measures[index].slots.filter((slot) => slot.kind === 'note');

    for (const slot of written.slots) {
      if (slot.kind !== 'note' || slot.pitches.length === 0) continue;
      const lowest = slot.pitches[0].midi;
      const highest = slot.pitches[slot.pitches.length - 1].midi;
      const tick = measure.startTick + slot.start;

      if (highest > KEYBOARD_HIGHEST) {
        warn('Right-hand note lies above C7, the highest key of a 61-key keyboard.');
      }
      if (highest - lowest > RIGHT_SPAN_LIMIT) {
        warn(`Right-hand notes span ${highest - lowest} semitones, wider than the hand reaches.`);
      }
      if (soundingAt(left, tick).some((event) => event.midi >= lowest)) {
        warn('Right hand reaches down into the left hand; move it higher.');
      }

      // Single short notes pass by; chords and held notes have to agree with the harmony.
      const sounding = right.find((event) => event.slotId === slot.id)?.duration ?? slot.duration;
      if (slot.pitches.length === 1 && sounding < beat) continue;

      const melodyHere =
        part.mode === 'fills'
          ? sung.find((candidate) => candidate.start === slot.start)
          : undefined;
      const melodyPitch = melodyHere?.pitches[melodyHere.pitches.length - 1]?.midi;
      const active = chordAt(harmony, tick);
      const tones = active?.chord ? chordPitchClasses(active.chord) : [];
      const offending = slot.pitches.find((pitch) => {
        if (pitch.midi === melodyPitch) return false;
        const pitchClassValue = mod(pitch.midi, 12);
        return (
          !tones.includes(pitchClassValue) &&
          tones.some((tone) => isHalfStep(pitchClassValue, tone))
        );
      });
      if (offending && active) {
        warn(
          `Right-hand note ${toneToText(offending.tone)} on beat ${beatOf(tick)} clashes with chord [${active.symbol}].`,
        );
      }

      if (part.mode === 'accompaniment') {
        const voice = soundingAt(melody, tick);
        const against = slot.pitches.find((pitch) =>
          voice.some((event) => isHalfStep(pitch.midi, event.midi)),
        );
        if (against) {
          warn(
            `Right-hand note ${toneToText(against.tone)} on beat ${beatOf(tick)} clashes with the sung melody.`,
          );
        }
      }
    }

    if (part.mode === 'fills') {
      for (const slot of sung) {
        const top = slot.pitches[slot.pitches.length - 1]?.midi;
        const kept = written.slots.find(
          (candidate) => candidate.kind === 'note' && candidate.start === slot.start,
        );
        if (!kept || kept.pitches[kept.pitches.length - 1]?.midi !== top) {
          warn(
            `The melody note on beat ${slot.start / beat + 1} is missing or changed; a fill may add notes but must keep the melody on top.`,
          );
        }
      }
    } else {
      // A chord that is still held must not grind against a new long note of the singers.
      for (const event of melody) {
        if (event.duration < beat || measureIndexAt(song, event.tick) !== index) continue;
        const held = soundingAt(right, event.tick).filter((note) => note.tick < event.tick);
        if (held.some((note) => isHalfStep(note.midi, event.midi))) {
          warn(
            `A held right-hand note clashes with the sung melody on beat ${beatOf(event.tick)}.`,
          );
        }
      }
    }

    // A replaced left hand must hand the harmony back as the next measure expects it.
    const next = composed.arrangement.measures[index + 1];
    if (written.left && next && !part.measures[index + 1]?.left) {
      const end = measure.startTick + measure.length - 1;
      const own = chordAt(ownHarmony, end)?.symbol ?? '';
      const replaced = chordAt(harmony, end)?.symbol ?? '';
      const restated = next.chords.some((mark) => mark.start === 0);
      if (!restated && normalizeChordSymbol(own) !== normalizeChordSymbol(replaced)) {
        warn(
          `The replaced left hand ends on [${replaced}], but the next measure continues [${own}]; end on the same chord.`,
          'left',
        );
      }
    }
  });

  const gaps = findGaps(song);
  const fillOnsets = noteOnsets(
    composed.song.measures.map((measure) => ({
      startTick: measure.startTick,
      slots: measure.fills ?? [],
    })),
  );
  const rightOnsets = [...noteOnsets(composed.song.measures), ...fillOnsets];
  checkGaps(
    song,
    gaps,
    [...leftHandOnsets(composed.song, composed.arrangement.measures), ...rightOnsets],
    arrangement.level !== 'easy',
    BOTH_HANDS,
    issues,
  );

  if (part.mode === 'fills') {
    for (const gap of gaps) {
      if (fillOnsets.some((tick) => tick > gap.start && tick < gap.end)) continue;
      issues.push({
        severity: 'warning',
        message: 'The melody waits here, but the right hand adds no fill.',
        measure: gap.measure,
        hand: 'right',
      });
    }
  }
  return issues;
}

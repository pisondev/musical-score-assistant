import { MAJOR_SCALE, mod, pitchClass } from './notes.ts';
import { beatTicks } from './time.ts';
import type { NoteName, Pitch, Slot, TimeSignature } from './types.ts';

/**
 * Staff notation for one row of slots.
 *
 * Numbered notation writes a long note as a digit followed by hold dots; a
 * staff writes it as one note value, split and tied where it crosses a beat.
 * This module makes that translation and decides beams and accidentals.
 */

const LETTER_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const LETTER_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

/** Note values that can be written with one note head, longest first: ticks, value, dots. */
const NOTE_VALUES: ReadonlyArray<readonly [ticks: number, value: number, dots: number]> = [
  [1920, 1, 0],
  [1440, 2, 1],
  [960, 2, 0],
  [720, 4, 1],
  [480, 4, 0],
  [360, 8, 1],
  [240, 8, 0],
  [180, 16, 1],
  [120, 16, 0],
  [90, 32, 1],
  [60, 32, 0],
];

/** A pitch as it is written on the staff. */
export interface StaffPitch {
  /** Letter name, "c" to "b". */
  step: string;
  /** Octave number in scientific pitch notation; middle C is C4. */
  octave: number;
  /** Semitones the letter is altered by: -1 flat, 0 natural, 1 sharp. */
  alter: number;
  /** The accidental sign to draw, or null when the key signature or an earlier note covers it. */
  accidental: number | null;
}

export type TieState = '' | 'i' | 'm' | 't';
export type GroupPosition = 'start' | 'middle' | 'end';

/** One note, chord, or rest as it is written on the staff. */
export interface StaffEvent {
  /** Slot id this symbol stands for; unique within the score. */
  id: string;
  kind: 'note' | 'rest';
  /** Ticks from the start of the measure. */
  start: number;
  /** Sounding length in ticks. */
  duration: number;
  /** Written note value: 1 whole, 2 half, 4 quarter, 8 eighth, and so on. */
  value: number;
  dots: number;
  pitches: StaffPitch[];
  tie: TieState;
  beam?: GroupPosition;
  /** Position within a triplet, when the event belongs to one. */
  triplet?: GroupPosition;
  lyric?: string;
  /** True where a rolled chord is struck; it gets an arpeggio line in front of it. */
  rolled?: boolean;
}

interface Chain {
  id: string;
  kind: 'note' | 'rest';
  start: number;
  duration: number;
  pitches: Pitch[];
  lyric?: string;
  rolled?: boolean;
  /** Ids of the slots that begin inside the chain, by their start tick. */
  ids: Map<number, string>;
  /** True when the chain continues a note from the previous measure. */
  tiedFromPrevious: boolean;
  triplet?: GroupPosition;
}

/** Accidental of every letter under the key signature, indexed C to B. */
export function keySignatureAlters(key: NoteName): number[] {
  const alters = new Array<number>(7).fill(0);
  const tonic = pitchClass(key);
  for (let degree = 0; degree < 7; degree += 1) {
    const letter = mod(key.letter + degree, 7);
    alters[letter] = mod(tonic + MAJOR_SCALE[degree] - LETTER_PITCH_CLASSES[letter] + 6, 12) - 6;
  }
  return alters;
}

/** The key signature as a count of sharps (positive) or flats (negative). */
export function keySignatureFifths(key: NoteName): number {
  return keySignatureAlters(key).reduce((sum, alter) => sum + alter, 0);
}

/** Spells a pitch for the staff from its numbered-notation tone. */
export function spellForStaff(pitch: Pitch, key: NoteName): Omit<StaffPitch, 'accidental'> {
  const letter = mod(key.letter + pitch.tone.degree - 1, 7);
  const alter = keySignatureAlters(key)[letter] + pitch.tone.accidental;
  return {
    step: LETTER_NAMES[letter],
    octave: Math.floor((pitch.midi - alter) / 12) - 1,
    alter,
  };
}

/** Length of the rhythmic unit that note values should not straddle. */
function pulseTicks(time: TimeSignature): number {
  const beat = beatTicks(time);
  const compound = time.unit === 8 && time.beats > 3 && time.beats % 3 === 0;
  return compound ? beat * 3 : beat;
}

/**
 * Splits a duration into note values that read well: a value that starts off
 * the pulse stops at the next pulse, and in four-four nothing but a note from
 * the downbeat crosses the middle of the measure.
 */
export function splitDuration(
  start: number,
  duration: number,
  measureLength: number,
  time: TimeSignature,
): { start: number; duration: number; value: number; dots: number }[] {
  const pulse = pulseTicks(time);
  const half = measureLength / 2;
  const quadruple = time.beats === 4 && time.unit === 4 && measureLength === 1920;
  const pieces: { start: number; duration: number; value: number; dots: number }[] = [];

  let position = start;
  let remaining = duration;
  while (remaining > 0) {
    let limit = measureLength;
    if (position % pulse !== 0) limit = (Math.floor(position / pulse) + 1) * pulse;
    else if (quadruple && position !== 0 && position < half) limit = half;

    const room = Math.min(remaining, limit - position);
    const fit = NOTE_VALUES.find(([ticks]) => ticks <= room);
    if (!fit) break;
    pieces.push({ start: position, duration: fit[0], value: fit[1], dots: fit[2] });
    position += fit[0];
    remaining -= fit[0];
  }
  return pieces;
}

/** Collects notes with their holds, and neighbouring rests, into chains. */
function buildChains(slots: Slot[], carried: Pitch[] | null): Chain[] {
  const chains: Chain[] = [];
  let open: Chain | null = null;

  const tripletPosition = (index: number): GroupPosition | undefined => {
    const slot = slots[index];
    if (slot.tuplet !== 3) return undefined;
    const sameGroup = (other: Slot | undefined) =>
      other !== undefined && other.tuplet === 3 && other.beat === slot.beat;
    if (!sameGroup(slots[index - 1])) return 'start';
    return sameGroup(slots[index + 1]) ? 'middle' : 'end';
  };

  slots.forEach((slot, index) => {
    const triplet = tripletPosition(index);
    // Inside a triplet every slot is written on its own, so the bracket stays intact.
    const mergeable = triplet === undefined && open !== null && open.triplet === undefined;

    if (slot.kind === 'hold') {
      if (open && open.kind === 'note' && mergeable) {
        open.duration += slot.duration;
        open.ids.set(slot.start, slot.id);
        return;
      }
      const previous: Pitch[] | null =
        open?.kind === 'note' ? open.pitches : chains.length === 0 ? carried : null;
      open = {
        id: slot.id,
        kind: previous ? 'note' : 'rest',
        start: slot.start,
        duration: slot.duration,
        pitches: previous ?? [],
        ids: new Map([[slot.start, slot.id]]),
        tiedFromPrevious: previous !== null,
        triplet,
      };
      chains.push(open);
      return;
    }

    if (slot.kind === 'rest' && open?.kind === 'rest' && mergeable) {
      open.duration += slot.duration;
      open.ids.set(slot.start, slot.id);
      return;
    }

    open = {
      id: slot.id,
      kind: slot.kind === 'rest' ? 'rest' : 'note',
      start: slot.start,
      duration: slot.duration,
      pitches: slot.kind === 'note' ? slot.pitches : [],
      lyric: slot.lyric,
      rolled: slot.rolled,
      ids: new Map([[slot.start, slot.id]]),
      tiedFromPrevious: false,
      triplet,
    };
    chains.push(open);
  });
  return chains;
}

function setBeams(events: StaffEvent[], time: TimeSignature): void {
  const pulse = pulseTicks(time);
  let group: StaffEvent[] = [];
  const close = () => {
    if (group.length >= 2) {
      group.forEach((event, index) => {
        event.beam = index === 0 ? 'start' : index === group.length - 1 ? 'end' : 'middle';
      });
    }
    group = [];
  };

  for (const event of events) {
    const beamable = event.kind === 'note' && event.value >= 8;
    const samePulse =
      group.length === 0 || Math.floor(group[0].start / pulse) === Math.floor(event.start / pulse);
    if (!beamable || !samePulse) close();
    if (beamable) group.push(event);
  }
  close();
}

/**
 * Writes one staff row. `measures` are the measures of a single hand in
 * order; the result has one list of events per measure.
 */
export function engraveRow(
  measures: ReadonlyArray<{ length: number; slots: Slot[] }>,
  time: TimeSignature,
  key: NoteName,
): StaffEvent[][] {
  const keyAlters = keySignatureAlters(key);
  const rows: StaffEvent[][] = [];
  let carried: Pitch[] | null = null;
  let previousLast: StaffEvent | null = null;

  for (const measure of measures) {
    const events: StaffEvent[] = [];
    const written = new Map<string, number>();
    const chains = buildChains(measure.slots, carried);

    chains.forEach((chain) => {
      const pieces =
        chain.triplet !== undefined
          ? [tripletPiece(chain)]
          : splitDuration(chain.start, chain.duration, measure.length, time);

      pieces.forEach((piece, index) => {
        const continues = index > 0 || chain.tiedFromPrevious;
        const pitches: StaffPitch[] = chain.pitches.map((pitch) => {
          const spelled = spellForStaff(pitch, key);
          const slotKey = `${spelled.step}${spelled.octave}`;
          const letter = LETTER_NAMES.indexOf(spelled.step);
          const inForce = written.get(slotKey) ?? keyAlters[letter];
          // A tied note repeats the pitch it continues and needs no new sign.
          const accidental = !continues && spelled.alter !== inForce ? spelled.alter : null;
          if (!continues) written.set(slotKey, spelled.alter);
          return { ...spelled, accidental };
        });

        let tie: TieState = '';
        if (chain.kind === 'note') {
          const first = index === 0 && !chain.tiedFromPrevious;
          const last = index === pieces.length - 1;
          tie = first && last ? '' : first ? 'i' : last ? 't' : 'm';
        }

        const event: StaffEvent = {
          id: index === 0 ? chain.id : (chain.ids.get(piece.start) ?? `${chain.id}_${index}`),
          kind: chain.kind,
          start: piece.start,
          duration: piece.duration,
          value: piece.value,
          dots: piece.dots,
          pitches,
          tie,
          triplet: chain.triplet,
          lyric: index === 0 ? chain.lyric : undefined,
          rolled: (index === 0 && chain.rolled && chain.pitches.length > 1) || undefined,
        };
        events.push(event);
      });
    });

    // A note carried over the barline ties back to the last note of the previous measure.
    const first = chains[0];
    if (first?.tiedFromPrevious && previousLast && previousLast.kind === 'note') {
      previousLast.tie =
        previousLast.tie === 't' ? 'm' : previousLast.tie === '' ? 'i' : previousLast.tie;
    }

    setBeams(events, time);
    rows.push(events);

    const lastChain = chains[chains.length - 1];
    const reachesEnd =
      lastChain !== undefined &&
      lastChain.kind === 'note' &&
      lastChain.start + lastChain.duration >= measure.length;
    carried = reachesEnd ? lastChain.pitches : null;
    previousLast = events[events.length - 1] ?? null;
  }
  return rows;
}

/** A triplet member is written as the value it would have without the triplet. */
function tripletPiece(chain: Chain): {
  start: number;
  duration: number;
  value: number;
  dots: number;
} {
  const plain = (chain.duration * 3) / 2;
  const fit = NOTE_VALUES.find(([ticks, , dots]) => ticks <= plain && dots === 0) ?? NOTE_VALUES[6];
  return { start: chain.start, duration: chain.duration, value: fit[1], dots: 0 };
}

import { formatChordSymbol } from './chord';
import { DynamicsTimeline } from './dynamics';
import { engraveRow, keySignatureFifths, type StaffEvent, type StaffPitch } from './staff';
import { beatTicks, measureTicks } from './time';
import type { Arrangement, Hand, Measure, SlotSpan, Song } from './types';

/**
 * Serializes a performance as MEI, the format the staff-notation engraver
 * reads. Every note carries the id of the slot it stands for, so the playhead
 * can find it in the rendered score.
 */

export interface MeiOptions {
  showLyrics: boolean;
  showDynamics: boolean;
}

export interface MeiResult {
  mei: string;
  /** Time span of every written note and rest, for following the playhead. */
  spans: SlotSpan[];
}

/** Id of the element that stands for a slot, shared with the numbered sheet. */
export function staffElementId(slotId: string): string {
  return `slot-${slotId}`;
}

/** Id of the element that stands for a measure. */
export function measureElementId(index: number): string {
  return `measure-${index}`;
}

const ACCIDENTAL_NAMES: Record<number, string> = { [-2]: 'ff', [-1]: 'f', 0: 'n', 1: 's', 2: 'x' };

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pitchAttributes(pitch: StaffPitch): string {
  let attributes = `pname="${pitch.step}" oct="${pitch.octave}"`;
  if (pitch.accidental !== null) {
    attributes += ` accid="${ACCIDENTAL_NAMES[pitch.accidental] ?? 'n'}"`;
  } else if (pitch.alter !== 0) {
    attributes += ` accid.ges="${ACCIDENTAL_NAMES[pitch.alter] ?? 'n'}"`;
  }
  return attributes;
}

/**
 * Writes lyric syllables. A syllable that ends in a hyphen continues the
 * word, so the engraver draws a dash between it and the next one.
 */
class LyricWriter {
  private insideWord = false;

  element(lyric: string): string {
    const continues = lyric.endsWith('-');
    const text = escapeXml(continues ? lyric.slice(0, -1) : lyric);
    const position = continues ? (this.insideWord ? 'm' : 'i') : this.insideWord ? 't' : 's';
    this.insideWord = continues;
    const connector = continues ? ' con="d"' : '';
    return `<verse n="1"><syl wordpos="${position}"${connector}>${text}</syl></verse>`;
  }
}

function eventElement(event: StaffEvent, hand: Hand, lyrics: LyricWriter | null): string {
  // The hand becomes a class on the drawn symbol, which the playhead colours by.
  const id = `xml:id="${staffElementId(event.id)}" type="${hand}"`;
  const duration = `dur="${event.value}"${event.dots > 0 ? ` dots="${event.dots}"` : ''}`;
  if (event.kind === 'rest') return `<rest ${id} ${duration}/>`;

  const tie = event.tie === '' ? '' : ` tie="${event.tie}"`;
  const lyric = lyrics && event.lyric ? lyrics.element(event.lyric) : '';
  if (event.pitches.length === 1) {
    return `<note ${id} ${duration} ${pitchAttributes(event.pitches[0])}${tie}>${lyric}</note>`;
  }
  const notes = event.pitches.map((pitch) => `<note ${pitchAttributes(pitch)}${tie}/>`).join('');
  return `<chord ${id} ${duration}>${notes}${lyric}</chord>`;
}

/** Wraps beamed and triplet groups around the events of one staff in one measure. */
function layerContent(
  events: StaffEvent[],
  measureLength: number,
  hand: Hand,
  lyrics: LyricWriter | null,
): string {
  const wholeRest =
    events.length > 0 &&
    events.every((event) => event.kind === 'rest') &&
    events.reduce((sum, event) => sum + event.duration, 0) >= measureLength;
  if (events.length === 0 || wholeRest) {
    const id = events[0] ? ` xml:id="${staffElementId(events[0].id)}"` : '';
    return `<mRest${id}/>`;
  }

  let content = '';
  for (const event of events) {
    if (event.triplet === 'start') content += '<tuplet num="3" numbase="2">';
    if (event.beam === 'start') content += '<beam>';
    content += eventElement(event, hand, lyrics);
    if (event.beam === 'end') content += '</beam>';
    if (event.triplet === 'end') content += '</tuplet>';
  }
  return content;
}

/** Position in a measure as an MEI timestamp: beat 1 is the start of the measure. */
function timestamp(offset: number, beat: number): string {
  return String(Number((offset / beat + 1).toFixed(4)));
}

/**
 * Writes the measures `from` (inclusive) to `to` (exclusive) of a performance
 * as a grand staff: the melody on the upper staff, the left hand on the lower.
 */
export function toMei(
  song: Song,
  arrangement: Arrangement,
  from: number,
  to: number,
  options: MeiOptions,
): MeiResult {
  const { time, key } = song.meta;
  const beat = beatTicks(time);
  const full = measureTicks(time);
  const measures = song.measures.slice(from, to);
  const parts = arrangement.measures.slice(from, to);

  const right = engraveRow(measures, time, key);
  const left = engraveRow(
    measures.map((measure, index) => ({ length: measure.length, slots: parts[index].slots })),
    time,
    key,
  );

  const spans: SlotSpan[] = [];
  const collect = (hand: Hand, measure: Measure, events: StaffEvent[]) => {
    for (const event of events) {
      const start = measure.startTick + event.start;
      spans.push({ id: event.id, hand, start, end: start + event.duration });
    }
  };

  const lyrics = options.showLyrics ? new LyricWriter() : null;
  const hairpins = options.showDynamics ? new DynamicsTimeline(song.measures).hairpins() : [];
  const rangeStart = measures[0]?.startTick ?? 0;
  const lastMeasure = measures[measures.length - 1];
  const rangeEnd = lastMeasure ? lastMeasure.startTick + lastMeasure.length : 0;

  const body = measures
    .map((measure, position) => {
      collect('right', measure, right[position]);
      collect('left', measure, left[position]);

      const controls: string[] = [];
      for (const chord of parts[position].chords) {
        controls.push(
          `<harm staff="1" place="above" tstamp="${timestamp(chord.start, beat)}">${escapeXml(formatChordSymbol(chord.symbol))}</harm>`,
        );
      }
      if (options.showDynamics) {
        for (const mark of measure.dynamics) {
          if (mark.sign === '<' || mark.sign === '>') continue;
          controls.push(
            `<dynam staff="1" place="below" tstamp="${timestamp(mark.start, beat)}">${mark.sign}</dynam>`,
          );
        }
        for (const hairpin of hairpins) {
          const starts =
            hairpin.start >= measure.startTick &&
            hairpin.start < measure.startTick + measure.length;
          // A hairpin that began before this section is drawn from the section's first measure.
          const entersHere =
            position === 0 && hairpin.start < rangeStart && hairpin.end > rangeStart;
          if (!starts && !entersHere) continue;

          const begin = Math.max(hairpin.start, rangeStart);
          const end = Math.min(hairpin.end, rangeEnd);
          if (end <= begin) continue;
          const endPosition = measures.findIndex(
            (candidate) =>
              end > candidate.startTick && end <= candidate.startTick + candidate.length,
          );
          if (endPosition === -1) continue;
          const endOffset = end - measures[endPosition].startTick;
          controls.push(
            `<hairpin staff="1" place="below" form="${hairpin.kind === 'crescendo' ? 'cres' : 'dim'}" ` +
              `tstamp="${timestamp(begin - measure.startTick, beat)}" ` +
              `tstamp2="${endPosition - position}m+${timestamp(endOffset, beat)}"/>`,
          );
        }
      }

      const attributes = [`xml:id="${measureElementId(measure.index)}"`];
      if (measure.part === 'song' && measure.number !== null)
        attributes.push(`n="${measure.number}"`);
      if (measure.length !== full) attributes.push('metcon="false"');
      if (measure.repeatStart) attributes.push('left="rptstart"');
      const isLast = position === measures.length - 1;
      if (measure.barline === 'final') attributes.push('right="end"');
      else if (measure.barline === 'repeat-end') attributes.push('right="rptend"');
      else if (isLast) attributes.push('right="dbl"');

      return (
        `<measure ${attributes.join(' ')}>` +
        `<staff n="1"><layer n="1">${layerContent(right[position], measure.length, 'right', lyrics)}</layer></staff>` +
        `<staff n="2"><layer n="1">${layerContent(left[position], measure.length, 'left', null)}</layer></staff>` +
        controls.join('') +
        '</measure>'
      );
    })
    .join('');

  const fifths = keySignatureFifths(key);
  const signature = fifths === 0 ? '0' : `${Math.abs(fifths)}${fifths > 0 ? 's' : 'f'}`;
  const mei =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">' +
    `<meiHead><fileDesc><titleStmt><title>${escapeXml(song.meta.title)}</title></titleStmt><pubStmt/></fileDesc></meiHead>` +
    '<music><body><mdiv><score>' +
    `<scoreDef keysig="${signature}" meter.count="${time.beats}" meter.unit="${time.unit}">` +
    '<staffGrp symbol="brace" bar.thru="true">' +
    '<staffDef n="1" lines="5" clef.shape="G" clef.line="2"/>' +
    '<staffDef n="2" lines="5" clef.shape="F" clef.line="4"/>' +
    '</staffGrp></scoreDef>' +
    `<section>${body}</section>` +
    '</score></mdiv></body></music></mei>';

  return { mei, spans };
}

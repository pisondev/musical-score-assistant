import { memo, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  beatTicks,
  buildSlotSpans,
  DynamicsTimeline,
  formatChordSymbol,
  type Arrangement,
  type ArrangementMeasure,
  type ChordMark,
  type Issue,
  type Measure,
  type Performance,
  type ScaleTone,
  type Slot,
  type SongBundle,
} from '../core';
import { usePlayer } from '../store/player';
import { cx } from './classnames';
import { keepInView } from './keep-in-view';
import {
  labelRowWidth,
  layOutSystems,
  measureWeight,
  type Label,
  type SystemLayout,
} from './sheet-layout';
import { useElementWidth } from './useElementWidth';
import { slotElementId, usePlayhead } from './usePlayhead';

/** Width, in pixels, that one weight unit (a plain beat) needs at minimum. */
const MIN_UNIT_WIDTH = 40;
const MAX_MEASURES_PER_SYSTEM = 4;
/** Width of the column that labels the two hands. */
const LABEL_WIDTH = 22;
/** Layout width used for paper: A4 portrait inside its margins. */
const PRINT_WIDTH = 700;
const PRINT_UNIT_WIDTH = 28;
/** Left and right margin of a track inside its measure, together (`.track` in sheet.css). */
const TRACK_MARGIN = 22;
/**
 * Sizes of the text on the sheet, for estimating how much room labels need:
 * the font sizes of sheet.css (`--lyric-size`, `--chord-size`) on the screen
 * and on paper, and the width of an average character as a share of them.
 */
const TEXT = {
  screen: { lyric: 11, chord: 12.5, changedChord: 10 },
  print: { lyric: 9, chord: 10.5, changedChord: 2 },
  lyricCharacter: 0.58,
  chordCharacter: 0.66,
  lyricGap: 2,
  chordGap: 5,
};

interface SheetProps {
  bundle: SongBundle;
  performance: Performance;
  showLyrics: boolean;
  showDynamics: boolean;
  /** Lays the score out for paper instead of the window. */
  printing: boolean;
  /** Rendered above the introduction, e.g. its title. */
  introHeading?: ReactNode;
}

/** A piece of a hairpin that falls inside one measure. */
interface HairpinPiece {
  kind: 'crescendo' | 'diminuendo';
  /** Position in the measure, as fractions of its length. */
  from: number;
  to: number;
  /** How far the hairpin has opened at each end of the piece, from 0 to 1. */
  openFrom: number;
  openTo: number;
  /** True when the hairpin begins in this measure, right after a level mark or not. */
  startsHere: boolean;
}

function percent(part: number, whole: number): string {
  return `${(part / whole) * 100}%`;
}

function OctaveDots({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <i key={index} />
      ))}
    </>
  );
}

function ToneGlyph({ tone }: { tone: ScaleTone }) {
  return (
    <span className="tone">
      <span className="tone__dots tone__dots--up">
        <OctaveDots count={Math.max(tone.octave, 0)} />
      </span>
      <span
        className={cx(
          'tone__digit',
          tone.accidental > 0 && 'is-sharp',
          tone.accidental < 0 && 'is-flat',
        )}
      >
        {tone.degree}
      </span>
      <span className="tone__dots tone__dots--down">
        <OctaveDots count={Math.max(-tone.octave, 0)} />
      </span>
    </span>
  );
}

/** Every row of slots that an arrangement may put into one song measure, in any right-hand mode. */
function rowsOf(arrangement: Arrangement, index: number): Slot[][] {
  const rows = [arrangement.measures[index].slots];
  for (const part of Object.values(arrangement.rightHand)) {
    const written = part.measures[index];
    if (!written) continue;
    rows.push(written.slots);
    if (written.left) rows.push(written.left.slots);
  }
  return rows;
}

/** Every row of chord symbols that an arrangement may put above one song measure. */
function chordRowsOf(arrangement: Arrangement, index: number): ChordMark[][] {
  const rows = [arrangement.measures[index].chords];
  for (const part of Object.values(arrangement.rightHand)) {
    const left = part.measures[index]?.left;
    if (left) rows.push(left.chords);
  }
  return rows;
}

/** Number of stacked digits a slot occupies. */
function cellCount(slot: Slot): number {
  return slot.kind === 'note' ? Math.max(1, slot.pitches.length) : 1;
}

function tallestStack(slots: Slot[]): number {
  return Math.max(1, ...slots.map(cellCount));
}

interface StaffRowProps {
  slots: Slot[];
  length: number;
  /** Leaves rests blank, for a voice that is silent most of the time. */
  quiet?: boolean;
}

function StaffRow({ slots, length, quiet = false }: StaffRowProps) {
  // Beams within one beat share a height, set by the tallest stack under them.
  const beamHeights = new Map<number, number>();
  for (const slot of slots) {
    if (slot.beams === 0) continue;
    beamHeights.set(slot.beat, Math.max(beamHeights.get(slot.beat) ?? 1, cellCount(slot)));
  }

  return (
    <>
      {slots.map((slot, index) => {
        const blank = (candidate: Slot | undefined) =>
          candidate === undefined || (quiet && candidate.kind === 'rest');
        if (blank(slot)) return null;
        const next = slots[index + 1];
        const previous = slots[index - 1];
        // A beam joins the next symbol of the beat, but never reaches over a blank.
        const sameBeat = !blank(next) && next.beat === slot.beat;
        const joinsFirst = sameBeat && next.beams >= 1;
        const joinsSecond = sameBeat && next.beams >= 2;
        const startsTuplet =
          slot.tuplet !== undefined &&
          (previous === undefined ||
            previous.beat !== slot.beat ||
            previous.tuplet !== slot.tuplet);
        const style = {
          left: percent(slot.start, length),
          width: percent(slot.duration, length),
          '--beam-cells': beamHeights.get(slot.beat) ?? 1,
        } as CSSProperties;

        return (
          <span
            key={slot.id}
            id={slotElementId(slot.id)}
            className={cx('slot', `slot--${slot.kind}`, slot.uncertain && 'slot--uncertain')}
            style={style}
          >
            {slot.beams >= 1 && <span className={cx('beam', joinsFirst && 'beam--join')} />}
            {slot.beams >= 2 && (
              <span className={cx('beam', 'beam--second', joinsSecond && 'beam--join')} />
            )}
            {startsTuplet && <span className="tuplet">{slot.tuplet}</span>}
            <span className="slot__body">
              {slot.kind === 'note' &&
                [...slot.pitches]
                  .reverse()
                  .map((pitch) => <ToneGlyph key={pitch.midi} tone={pitch.tone} />)}
              {slot.kind === 'rest' && <span className="glyph">0</span>}
              {slot.kind === 'hold' && <span className="glyph glyph--hold" />}
            </span>
          </span>
        );
      })}
    </>
  );
}

function ChordRow({ chords, length }: { chords: ChordMark[]; length: number }) {
  return (
    <>
      {chords.map((chord) => (
        <span
          key={`${chord.start}-${chord.symbol}`}
          className={cx(
            'chord',
            chord.changed && 'chord--changed',
            !chord.recognized && 'chord--unknown',
          )}
          style={{ left: percent(chord.start, length) }}
          title={chord.changed ? 'Differs from the printed score' : undefined}
        >
          {formatChordSymbol(chord.symbol)}
        </span>
      ))}
    </>
  );
}

function LyricRow({ slots, length }: { slots: Slot[]; length: number }) {
  return (
    <>
      {slots.map(
        (slot) =>
          slot.lyric && (
            <span key={slot.id} className="lyric" style={{ left: percent(slot.start, length) }}>
              {slot.lyric}
            </span>
          ),
      )}
    </>
  );
}

function DynamicsRow({ measure, hairpins }: { measure: Measure; hairpins: HairpinPiece[] }) {
  const levels = measure.dynamics.filter((mark) => mark.sign !== '<' && mark.sign !== '>');
  return (
    <>
      {levels.map((mark) => (
        <span
          key={`${mark.start}-${mark.sign}`}
          className="dynamic"
          style={{ left: percent(mark.start, measure.length) }}
        >
          {mark.sign}
        </span>
      ))}
      {hairpins.map((piece) => {
        // Leave room for a level mark written at the point where the hairpin opens.
        const sharesStart =
          piece.startsHere &&
          levels.some((mark) => Math.abs(mark.start / measure.length - piece.from) < 1e-6);
        const inset = sharesStart ? 24 : 2;
        const open = piece.kind === 'crescendo' ? piece.openFrom : 1 - piece.openFrom;
        const close = piece.kind === 'crescendo' ? piece.openTo : 1 - piece.openTo;
        return (
          <svg
            key={`${piece.kind}-${piece.from}`}
            className="hairpin"
            style={{
              left: `calc(${piece.from * 100}% + ${inset}px)`,
              width: `calc(${(piece.to - piece.from) * 100}% - ${inset + 6}px)`,
            }}
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
            role="img"
            aria-label={piece.kind}
          >
            <line x1="0" y1={5 - 4.6 * open} x2="100" y2={5 - 4.6 * close} />
            <line x1="0" y1={5 + 4.6 * open} x2="100" y2={5 + 4.6 * close} />
          </svg>
        );
      })}
    </>
  );
}

interface MeasureViewProps {
  measure: Measure;
  part: ArrangementMeasure;
  /** Text shown above the measure: its number, or a counter within the introduction. */
  label: string;
  weight: number;
  hairpins: HairpinPiece[];
  isCurrent: boolean;
  isFirstInSystem: boolean;
  isLastOfIntro: boolean;
  inLoop: boolean;
  severity: Issue['severity'] | null;
  /** Reserves the row of added notes, when any measure of the system has them. */
  showFills: boolean;
  showLyrics: boolean;
  showDynamics: boolean;
  onSelect: (index: number) => void;
}

const MeasureView = memo(function MeasureView({
  measure,
  part,
  label,
  weight,
  hairpins,
  isCurrent,
  isFirstInSystem,
  isLastOfIntro,
  inLoop,
  severity,
  showFills,
  showLyrics,
  showDynamics,
  onSelect,
}: MeasureViewProps) {
  const name =
    measure.part === 'intro'
      ? `Intro measure ${label}`
      : measure.number === null
        ? 'Pickup measure'
        : `Measure ${measure.number}`;
  const explanation = [part.note, part.rightNote].filter(Boolean).join(' ');
  return (
    <div
      id={`measure-${measure.index}`}
      className={cx(
        'measure',
        isCurrent && 'is-current',
        isFirstInSystem && 'measure--first',
        (measure.barline === 'final' || isLastOfIntro) && 'measure--final',
        measure.barline === 'repeat-end' && 'measure--repeat-end',
        measure.repeatStart && 'measure--repeat-start',
        inLoop && 'in-loop',
        severity && `has-${severity}`,
      )}
      style={{ flexGrow: weight, flexBasis: 0 }}
      role="button"
      tabIndex={0}
      aria-label={`${name}. Activate to move the playhead here.`}
      onClick={() => onSelect(measure.index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect(measure.index);
      }}
    >
      <div className="measure__meta">
        <span className="measure__number">{label}</span>
        {measure.section && <span className="measure__section">{measure.section}</span>}
        {explanation && <span className="measure__flag" title={explanation} />}
      </div>
      <div className="track track--chords">
        <ChordRow chords={part.chords} length={measure.length} />
      </div>
      <div className="measure__staff">
        {measure.voice && (
          <div className="track track--voice">
            <StaffRow slots={measure.voice} length={measure.length} />
          </div>
        )}
        {measure.voice && showLyrics && (
          <div className="track track--lyrics">
            <LyricRow slots={measure.voice} length={measure.length} />
          </div>
        )}
        <div className="track track--right">
          <StaffRow slots={measure.slots} length={measure.length} />
        </div>
        {!measure.voice && showLyrics && (
          <div className="track track--lyrics">
            <LyricRow slots={measure.slots} length={measure.length} />
          </div>
        )}
        {showFills && (
          <div className="track track--fills">
            {measure.fills && <StaffRow slots={measure.fills} length={measure.length} quiet />}
          </div>
        )}
        {showDynamics && (
          <div className="track track--dynamics">
            <DynamicsRow measure={measure} hairpins={hairpins} />
          </div>
        )}
        <div className="track track--left">
          <StaffRow slots={part.slots} length={measure.length} />
        </div>
      </div>
    </div>
  );
});

function RowLabels({
  showVoice,
  showFills,
  showLyrics,
  showDynamics,
}: {
  showVoice: boolean;
  showFills: boolean;
  showLyrics: boolean;
  showDynamics: boolean;
}) {
  return (
    <div className="system__labels" aria-hidden="true">
      <div className="measure__meta" />
      <div className="track track--chords" />
      {showVoice && (
        <div className="track track--voice">
          <span>V</span>
        </div>
      )}
      {showVoice && showLyrics && <div className="track track--lyrics" />}
      <div className="track track--right">
        <span>R</span>
      </div>
      {!showVoice && showLyrics && <div className="track track--lyrics" />}
      {showFills && (
        <div className="track track--fills">
          <span>+</span>
        </div>
      )}
      {showDynamics && <div className="track track--dynamics" />}
      <div className="track track--left">
        <span>L</span>
      </div>
    </div>
  );
}

/** Highest severity among the issues that belong to each measure. */
function severityByMeasure(issues: Issue[]): Map<number, Issue['severity']> {
  const rank = { info: 0, warning: 1, error: 2 } as const;
  const result = new Map<number, Issue['severity']>();
  for (const issue of issues) {
    if (issue.measure === undefined || issue.severity === 'info') continue;
    const known = result.get(issue.measure);
    if (!known || rank[issue.severity] > rank[known]) result.set(issue.measure, issue.severity);
  }
  return result;
}

/** Cuts every hairpin into the pieces that fall inside each measure. */
function hairpinsByMeasure(measures: Measure[]): HairpinPiece[][] {
  const pieces: HairpinPiece[][] = measures.map(() => []);
  for (const hairpin of new DynamicsTimeline(measures).hairpins()) {
    const span = hairpin.end - hairpin.start;
    if (span <= 0) continue;
    for (const measure of measures) {
      const from = Math.max(hairpin.start, measure.startTick);
      const to = Math.min(hairpin.end, measure.startTick + measure.length);
      if (to <= from) continue;
      pieces[measure.index].push({
        kind: hairpin.kind,
        from: (from - measure.startTick) / measure.length,
        to: (to - measure.startTick) / measure.length,
        openFrom: (from - hairpin.start) / span,
        openTo: (to - hairpin.start) / span,
        startsHere: from === hairpin.start,
      });
    }
  }
  return pieces;
}

const NO_HAIRPINS: HairpinPiece[] = [];

/**
 * The numbered-notation score: the right hand above, the chosen left hand
 * below. Fills add a second right-hand row under the melody where they play,
 * and an accompaniment gets the sung melody as a small row on top.
 */
export function Sheet({
  bundle,
  performance,
  showLyrics,
  showDynamics,
  printing,
  introHeading,
}: SheetProps) {
  const { song, arrangement, introMeasures } = performance;
  const container = useRef<HTMLDivElement>(null);
  const measuredWidth = useElementWidth(container);
  const width = printing ? PRINT_WIDTH : measuredWidth;
  const unitWidth = printing ? PRINT_UNIT_WIDTH : MIN_UNIT_WIDTH;

  // Song measures leave room for every arrangement and every right-hand part,
  // so the layout stays put when the player switches between them. A measure
  // is as wide as its notes need, or wider when its syllables or chord
  // symbols would otherwise run into each other.
  const weights = useMemo(() => {
    const beat = beatTicks(song.meta.time);
    const size = printing ? TEXT.print : TEXT.screen;
    const lyricLabels = (slots: Slot[]): Label[] =>
      slots.flatMap((slot) =>
        slot.lyric
          ? [{ start: slot.start, width: slot.lyric.length * size.lyric * TEXT.lyricCharacter }]
          : [],
      );
    const chordLabels = (chords: ChordMark[]): Label[] =>
      chords.map((chord) => ({
        start: chord.start,
        width:
          formatChordSymbol(chord.symbol).length * size.chord * TEXT.chordCharacter +
          (chord.changed ? size.changedChord : 0),
      }));

    return song.measures.map((measure, index) => {
      const own = arrangement.measures[index];
      const inSong = index >= introMeasures;
      const rows = inSong
        ? [
            bundle.song.measures[index - introMeasures].slots,
            ...bundle.arrangements.flatMap((candidate) => rowsOf(candidate, index - introMeasures)),
          ]
        : [measure.slots, own.slots];
      const chordRows = inSong
        ? [
            own.chords,
            ...bundle.arrangements.flatMap((candidate) =>
              chordRowsOf(candidate, index - introMeasures),
            ),
          ]
        : [own.chords];
      const text = Math.max(
        labelRowWidth(measure.length, lyricLabels(measure.voice ?? measure.slots), TEXT.lyricGap),
        ...chordRows.map((chords) =>
          labelRowWidth(measure.length, chordLabels(chords), TEXT.chordGap),
        ),
      );
      return Math.max(
        measureWeight(measure.length, beat, rows),
        text > 0 ? (text + TRACK_MARGIN) / unitWidth : 0,
      );
    });
  }, [song, arrangement, bundle, introMeasures, printing, unitWidth]);

  const sections = useMemo(() => {
    const capacity = Math.max(1, (width - LABEL_WIDTH) / unitWidth);
    const indexes = song.measures.map((measure) => measure.index);
    const isPickup = (index: number) =>
      song.measures[index].part === 'song' && song.measures[index].number === null;
    const lay = (range: number[]) =>
      layOutSystems(range, weights, isPickup, capacity, MAX_MEASURES_PER_SYSTEM);
    return {
      intro: lay(indexes.slice(0, introMeasures)),
      song: lay(indexes.slice(introMeasures)),
    };
  }, [song, weights, width, unitWidth, introMeasures]);

  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const status = usePlayer((state) => state.status);
  const loop = usePlayer((state) => state.loop);
  const seekToMeasure = usePlayer((state) => state.seekToMeasure);
  const spans = useMemo(() => buildSlotSpans(song, arrangement), [song, arrangement]);
  usePlayhead(song, spans);

  const hasLyrics = useMemo(
    () =>
      song.measures.some((measure) => (measure.voice ?? measure.slots).some((slot) => slot.lyric)),
    [song],
  );
  const hasDynamics = useMemo(
    () => song.measures.some((measure) => measure.dynamics.length > 0),
    [song],
  );
  const hairpins = useMemo(() => hairpinsByMeasure(song.measures), [song]);
  const severities = useMemo(
    () => severityByMeasure([...song.issues, ...arrangement.issues]),
    [song, arrangement],
  );

  // Keep the measure being played in view.
  useEffect(() => {
    if (status !== 'playing') return;
    const element = document.getElementById(`measure-${currentMeasure}`);
    if (element) keepInView(element);
  }, [currentMeasure, status]);

  const active = status === 'playing' || status === 'paused';
  const lyrics = showLyrics && hasLyrics;
  const dynamics = showDynamics && hasDynamics;

  const renderSystems = (systems: SystemLayout[]) =>
    systems.map((system) => {
      const rowHeights = {
        '--right-cells': Math.max(
          ...system.measures.map((index) => tallestStack(song.measures[index].slots)),
        ),
        '--left-cells': Math.max(
          ...system.measures.map((index) => tallestStack(arrangement.measures[index].slots)),
        ),
        '--fill-cells': Math.max(
          ...system.measures.map((index) => tallestStack(song.measures[index].fills ?? [])),
        ),
      } as CSSProperties;
      const showVoice = system.measures.some((index) => song.measures[index].voice !== undefined);
      // Only the systems with a fill get the extra row, so the rest of the page stays compact.
      const showFills = system.measures.some((index) =>
        song.measures[index].fills?.some((slot) => slot.kind === 'note'),
      );
      return (
        <div key={system.measures[0]} className="system" style={rowHeights}>
          <RowLabels
            showVoice={showVoice}
            showFills={showFills}
            showLyrics={lyrics}
            showDynamics={dynamics}
          />
          {system.measures.map((index, position) => {
            const measure = song.measures[index];
            const label = measure.part === 'intro' ? `${index + 1}` : `${measure.number ?? ''}`;
            return (
              <MeasureView
                key={index}
                measure={measure}
                part={arrangement.measures[index]}
                label={label}
                weight={weights[index]}
                hairpins={hairpins[index].length > 0 ? hairpins[index] : NO_HAIRPINS}
                isCurrent={active && index === currentMeasure}
                isFirstInSystem={position === 0}
                isLastOfIntro={index === introMeasures - 1}
                inLoop={loop.enabled && index >= loop.from && index <= loop.to}
                severity={severities.get(index) ?? null}
                showFills={showFills}
                showLyrics={lyrics}
                showDynamics={dynamics}
                onSelect={seekToMeasure}
              />
            );
          })}
          {system.filler > 0 && <div style={{ flexGrow: system.filler, flexBasis: 0 }} />}
        </div>
      );
    });

  return (
    <div ref={container} className={cx('sheet', printing && 'sheet--print')} aria-label="Score">
      {width > 0 && introMeasures > 0 && (
        <section className="sheet__section sheet__section--intro" aria-label="Introduction">
          {introHeading}
          {renderSystems(sections.intro)}
        </section>
      )}
      {width > 0 && (
        <section className="sheet__section" aria-label="Song">
          {introMeasures > 0 && <h3 className="sheet__heading">Song</h3>}
          {renderSystems(sections.song)}
        </section>
      )}
    </div>
  );
}

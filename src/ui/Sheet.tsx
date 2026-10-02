import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  formatChordSymbol,
  type Arrangement,
  type ArrangementMeasure,
  type ChordMark,
  type Issue,
  type Measure,
  type ScaleTone,
  type Slot,
  type Song,
} from '../core';
import { usePlayer } from '../store/player';
import { cx } from './classnames';
import { layOutSystems, measureWeights, type SystemLayout } from './sheet-layout';
import { slotElementId, usePlayhead } from './usePlayhead';

/** Width, in pixels, that one weight unit (a plain beat) needs at minimum. */
const MIN_UNIT_WIDTH = 40;
const MAX_MEASURES_PER_SYSTEM = 4;
/** Width of the column that labels the two hands. */
const LABEL_WIDTH = 22;

interface SheetProps {
  song: Song;
  /** The arrangement on display. */
  arrangement: Arrangement;
  /** Every arrangement of the song; the layout leaves room for all of them. */
  arrangements: Arrangement[];
}

/** Width of an element, tracked as it resizes. */
function useElementWidth(element: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const measure = () => setWidth(target.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return width;
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

/** Number of stacked digits a slot occupies. */
function cellCount(slot: Slot): number {
  return slot.kind === 'note' ? Math.max(1, slot.pitches.length) : 1;
}

function StaffRow({ slots, length }: { slots: Slot[]; length: number }) {
  // Beams within one beat share a height, set by the tallest stack under them.
  const beamHeights = new Map<number, number>();
  for (const slot of slots) {
    if (slot.beams === 0) continue;
    beamHeights.set(slot.beat, Math.max(beamHeights.get(slot.beat) ?? 1, cellCount(slot)));
  }

  return (
    <>
      {slots.map((slot, index) => {
        const next = slots[index + 1];
        const previous = slots[index - 1];
        const sameBeat = next !== undefined && next.beat === slot.beat;
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

interface MeasureViewProps {
  measure: Measure;
  part: ArrangementMeasure;
  weight: number;
  isCurrent: boolean;
  isFirstInSystem: boolean;
  inLoop: boolean;
  severity: Issue['severity'] | null;
  showLyrics: boolean;
  onSelect: (index: number) => void;
}

const MeasureView = memo(function MeasureView({
  measure,
  part,
  weight,
  isCurrent,
  isFirstInSystem,
  inLoop,
  severity,
  showLyrics,
  onSelect,
}: MeasureViewProps) {
  const label = measure.number === null ? 'Pickup measure' : `Measure ${measure.number}`;
  return (
    <div
      id={`measure-${measure.index}`}
      className={cx(
        'measure',
        isCurrent && 'is-current',
        isFirstInSystem && 'measure--first',
        measure.barline === 'final' && 'measure--final',
        measure.barline === 'repeat-end' && 'measure--repeat-end',
        measure.repeatStart && 'measure--repeat-start',
        inLoop && 'in-loop',
        severity && `has-${severity}`,
      )}
      style={{ flexGrow: weight, flexBasis: 0 }}
      role="button"
      tabIndex={0}
      aria-label={`${label}. Activate to move the playhead here.`}
      onClick={() => onSelect(measure.index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect(measure.index);
      }}
    >
      <div className="measure__meta">
        <span className="measure__number">{measure.number ?? ''}</span>
        {measure.section && <span className="measure__section">{measure.section}</span>}
        {part.note && <span className="measure__flag" title={part.note} />}
      </div>
      <div className="track track--chords">
        <ChordRow chords={part.chords} length={measure.length} />
      </div>
      <div className="measure__staff">
        <div className="track track--right">
          <StaffRow slots={measure.slots} length={measure.length} />
        </div>
        {showLyrics && (
          <div className="track track--lyrics">
            {measure.slots.map(
              (slot) =>
                slot.lyric && (
                  <span
                    key={slot.id}
                    className="lyric"
                    style={{ left: percent(slot.start, measure.length) }}
                  >
                    {slot.lyric}
                  </span>
                ),
            )}
          </div>
        )}
        <div className="track track--left">
          <StaffRow slots={part.slots} length={measure.length} />
        </div>
      </div>
    </div>
  );
});

function RowLabels({ showLyrics }: { showLyrics: boolean }) {
  return (
    <div className="system__labels" aria-hidden="true">
      <div className="measure__meta" />
      <div className="track track--chords" />
      <div className="track track--right">
        <span>R</span>
      </div>
      {showLyrics && <div className="track track--lyrics" />}
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

/** The numbered-notation score: melody above, the chosen left hand below. */
export function Sheet({ song, arrangement, arrangements }: SheetProps) {
  const container = useRef<HTMLDivElement>(null);
  const width = useElementWidth(container);

  const weights = useMemo(() => measureWeights(song, arrangements), [song, arrangements]);
  const systems = useMemo(() => {
    const capacity = Math.max(1, (width - LABEL_WIDTH) / MIN_UNIT_WIDTH);
    return layOutSystems(
      weights,
      (index) => song.measures[index].number === null,
      capacity,
      MAX_MEASURES_PER_SYSTEM,
    );
  }, [song, weights, width]);

  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const status = usePlayer((state) => state.status);
  const loop = usePlayer((state) => state.loop);
  const seekToMeasure = usePlayer((state) => state.seekToMeasure);
  usePlayhead(song, arrangement);

  const showLyrics = useMemo(
    () => song.measures.some((measure) => measure.slots.some((slot) => slot.lyric)),
    [song],
  );
  const severities = useMemo(
    () => severityByMeasure([...song.issues, ...arrangement.issues]),
    [song, arrangement],
  );
  // The left-hand row of a system is as tall as the tallest stack in that system.
  const leftCells = (system: SystemLayout) =>
    Math.max(
      1,
      ...system.measures.flatMap((index) => arrangement.measures[index].slots.map(cellCount)),
    );

  // Keep the measure being played in view.
  useEffect(() => {
    if (status !== 'playing') return;
    const element = document.getElementById(`measure-${currentMeasure}`);
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.top < 72 || box.bottom > window.innerHeight - 120) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentMeasure, status]);

  const active = status === 'playing' || status === 'paused';

  return (
    <div ref={container} className="sheet" aria-label="Score">
      {width > 0 &&
        systems.map((system) => (
          <div
            key={system.measures[0]}
            className="system"
            style={{ '--left-cells': leftCells(system) } as CSSProperties}
          >
            <RowLabels showLyrics={showLyrics} />
            {system.measures.map((index, position) => (
              <MeasureView
                key={index}
                measure={song.measures[index]}
                part={arrangement.measures[index]}
                weight={weights[index]}
                isCurrent={active && index === currentMeasure}
                isFirstInSystem={position === 0}
                inLoop={loop.enabled && index >= loop.from && index <= loop.to}
                severity={severities.get(index) ?? null}
                showLyrics={showLyrics}
                onSelect={seekToMeasure}
              />
            ))}
            {system.filler > 0 && <div style={{ flexGrow: system.filler, flexBasis: 0 }} />}
          </div>
        ))}
    </div>
  );
}

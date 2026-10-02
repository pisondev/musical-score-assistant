import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from 'react';
import type { Performance, SlotSpan } from '../core';
import { measureElementId, toMei } from '../core/mei';
import { usePlayer } from '../store/player';
import { cx } from './classnames';
import { useElementWidth } from './useElementWidth';
import { usePlayhead } from './usePlayhead';
import { useVerovio } from './useVerovio';

/** Size of the music relative to the engraver's default, in percent. */
const SCREEN_SCALE = 44;
const NARROW_SCALE = 34;
const PRINT_SCALE = 36;
const NARROW_WIDTH = 640;
/** Layout width used for paper: A4 portrait inside its margins. */
const PRINT_WIDTH = 700;

const CURRENT_CLASS = 'is-current';
const MEASURE_ID = /^measure-(\d+)$/;

interface StaffSheetProps {
  performance: Performance;
  showLyrics: boolean;
  showDynamics: boolean;
  /** Lays the score out for paper instead of the window. */
  printing: boolean;
  /** Rendered above the introduction, e.g. its title. */
  introHeading?: ReactNode;
}

interface RenderedSection {
  svg: string;
  spans: SlotSpan[];
}

const NO_SPANS: SlotSpan[] = [];

/** The score on a grand staff: melody in the treble clef, left hand in the bass clef. */
export function StaffSheet({
  performance,
  showLyrics,
  showDynamics,
  printing,
  introHeading,
}: StaffSheetProps) {
  const { song, arrangement, introMeasures } = performance;
  const container = useRef<HTMLDivElement>(null);
  const measuredWidth = useElementWidth(container);
  const width = printing ? PRINT_WIDTH : measuredWidth;
  const { toolkit, failed } = useVerovio();

  // The introduction and the song are engraved separately, so each starts on its own system.
  const sections = useMemo<RenderedSection[] | null>(() => {
    if (!toolkit || width === 0) return null;
    const scale = printing ? PRINT_SCALE : width < NARROW_WIDTH ? NARROW_SCALE : SCREEN_SCALE;
    toolkit.setOptions({
      pageWidth: Math.round((width * 100) / scale),
      pageHeight: 60000,
      adjustPageHeight: true,
      scale,
      breaks: 'auto',
      header: 'none',
      footer: 'none',
      pageMarginLeft: 20,
      pageMarginRight: 20,
      pageMarginTop: 30,
      pageMarginBottom: 20,
      svgViewBox: true,
    });

    const total = song.measures.length;
    const ranges =
      introMeasures > 0
        ? [
            [0, introMeasures],
            [introMeasures, total],
          ]
        : [[0, total]];
    return ranges.map(([from, to]) => {
      const { mei, spans } = toMei(song, arrangement, from, to, { showLyrics, showDynamics });
      toolkit.loadData(mei);
      return { svg: toolkit.renderToSVG(1), spans };
    });
  }, [toolkit, width, printing, song, arrangement, introMeasures, showLyrics, showDynamics]);

  const spans = useMemo(
    () => (sections ? sections.flatMap((section) => section.spans) : NO_SPANS),
    [sections],
  );
  usePlayhead(song, spans);

  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const status = usePlayer((state) => state.status);
  const seekToMeasure = usePlayer((state) => state.seekToMeasure);
  const active = status === 'playing' || status === 'paused';

  // Mark the measure under the playhead and keep it in view.
  useEffect(() => {
    if (!active || !sections) return;
    const element = document.getElementById(measureElementId(currentMeasure));
    if (!element) return;
    element.classList.add(CURRENT_CLASS);
    if (status === 'playing') {
      const box = element.getBoundingClientRect();
      if (box.top < 72 || box.bottom > window.innerHeight - 120) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    return () => element.classList.remove(CURRENT_CLASS);
  }, [currentMeasure, active, status, sections]);

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const measure = (event.target as Element).closest('g.measure');
    const match = measure ? MEASURE_ID.exec(measure.id) : null;
    if (match) seekToMeasure(Number(match[1]));
  };

  const renderSection = (section: RenderedSection) => (
    <div
      className="staff-view__music"
      onClick={seek}
      // The engraver returns a complete SVG document built from the song files.
      dangerouslySetInnerHTML={{ __html: section.svg }}
    />
  );

  return (
    <div
      ref={container}
      className={cx('sheet', 'staff-view', printing && 'sheet--print')}
      aria-label="Score in staff notation"
    >
      {failed && (
        <p className="staff-view__status" role="alert">
          Staff notation could not be loaded. Switch back to numbers, or reload the page.
        </p>
      )}
      {!failed && !sections && <p className="staff-view__status">Preparing staff notation…</p>}
      {sections && introMeasures > 0 && (
        <section className="sheet__section sheet__section--intro" aria-label="Introduction">
          {introHeading}
          {renderSection(sections[0])}
        </section>
      )}
      {sections && (
        <section className="sheet__section" aria-label="Song">
          {introMeasures > 0 && <h3 className="sheet__heading">Song</h3>}
          {renderSection(sections[sections.length - 1])}
        </section>
      )}
    </div>
  );
}

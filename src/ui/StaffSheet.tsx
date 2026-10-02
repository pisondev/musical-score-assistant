import { useEffect, useLayoutEffect, useMemo, useRef, type MouseEvent } from 'react';
import { measureNames, type Performance, type PerformanceSection, type SlotSpan } from '../core';
import { measureElementId, toMei } from '../core/mei';
import { usePlayer } from '../store/player';
import { cx } from './classnames';
import { PencilIcon } from './icons';
import { keepInView } from './keep-in-view';
import { SectionHeading } from './SectionHeading';
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
  /** Indexes of the measures the player has written notes on. */
  noted: ReadonlySet<number>;
  /** Opens the notes of the measure at an index. */
  onOpenNotes: (index: number) => void;
}

interface RenderedSection {
  section: PerformanceSection;
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
  noted,
  onOpenNotes,
}: StaffSheetProps) {
  const { song, arrangement, sections: parts } = performance;
  const container = useRef<HTMLDivElement>(null);
  const measuredWidth = useElementWidth(container);
  const width = printing ? PRINT_WIDTH : measuredWidth;
  const { toolkit, failed } = useVerovio();

  // Every section is engraved separately: it starts on its own system and carries its own key.
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

    return parts.map((section) => {
      const { mei, spans } = toMei(
        song,
        arrangement,
        section.start,
        section.start + section.count,
        {
          showLyrics,
          showDynamics,
          key: section.key,
        },
      );
      toolkit.loadData(mei);
      return { section, svg: toolkit.renderToSVG(1), spans };
    });
  }, [toolkit, width, printing, song, arrangement, parts, showLyrics, showDynamics]);

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
    if (status === 'playing') keepInView(element);
    return () => element.classList.remove(CURRENT_CLASS);
  }, [currentMeasure, active, status, sections]);

  // The engraving is one image per section, so the marks of measures with notes are laid
  // over it: each is moved to the top left corner of its measure once the image is there.
  const names = useMemo(() => measureNames(performance), [performance]);
  useLayoutEffect(() => {
    if (!sections) return;
    for (const mark of container.current?.querySelectorAll<HTMLElement>('.staff-view__note') ??
      []) {
      const block = mark.parentElement;
      const measure = document.getElementById(measureElementId(Number(mark.dataset.measure)));
      mark.hidden = !block || !measure;
      if (!block || !measure) continue;
      const origin = block.getBoundingClientRect();
      const box = measure.getBoundingClientRect();
      mark.style.left = `${box.left - origin.left}px`;
      mark.style.top = `${box.top - origin.top}px`;
    }
  }, [sections, noted]);

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const measure = (event.target as Element).closest('g.measure');
    const match = measure ? MEASURE_ID.exec(measure.id) : null;
    if (match) seekToMeasure(Number(match[1]));
  };

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
      {sections?.map(({ section, svg }) => (
        <section
          key={section.start}
          className={cx('sheet__section', section.kind !== 'song' && 'sheet__section--aside')}
          aria-label={section.title}
        >
          {sections.length > 1 && <SectionHeading section={section} />}
          <div className="staff-view__block">
            <div
              className="staff-view__music"
              onClick={seek}
              // The engraver returns a complete SVG document built from the song files.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            {[...noted]
              .filter((index) => index >= section.start && index < section.start + section.count)
              .map((index) => (
                <button
                  key={index}
                  type="button"
                  className="measure__note staff-view__note"
                  data-measure={index}
                  title="Your notes on this measure"
                  aria-label={`Notes on ${names[index]?.long ?? 'this measure'}`}
                  onClick={() => onOpenNotes(index)}
                >
                  <PencilIcon width={11} height={11} />
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

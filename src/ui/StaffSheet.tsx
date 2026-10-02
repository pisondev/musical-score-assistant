import { useEffect, useLayoutEffect, useMemo, useRef, type MouseEvent } from 'react';
import { measureNames, type Performance, type PerformanceSection, type SlotSpan } from '../core';
import { measureElementId, toMei } from '../core/mei';
import { usePlayer } from '../store/player';
import { cx } from './classnames';
import { PencilIcon } from './icons';
import { keepInView } from './keep-in-view';
import { measureAtPoint } from './measure-box';
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
const LOOP_CLASS = 'in-loop';
const BACKGROUND_CLASS = 'measure-bg';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Puts a box behind the notes of an engraved measure, from its top staff to
 * its bottom one and a little beyond. The engraving has none: without it the
 * space between the notes belongs to no measure, and a measure has nothing to
 * show the pointer, the playhead, or a loop with.
 */
function addBackground(measure: SVGGElement): void {
  if (measure.querySelector(`:scope > rect.${BACKGROUND_CLASS}`)) return;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let staffHeight = 0;
  for (const staff of measure.querySelectorAll<SVGGElement>(':scope > g.staff')) {
    let staffTop = Infinity;
    let staffBottom = -Infinity;
    // The staff lines are the paths directly inside a staff.
    for (const line of staff.querySelectorAll<SVGPathElement>(':scope > path')) {
      const box = line.getBBox();
      left = Math.min(left, box.x);
      right = Math.max(right, box.x + box.width);
      staffTop = Math.min(staffTop, box.y);
      staffBottom = Math.max(staffBottom, box.y + box.height);
    }
    if (staffBottom < staffTop) continue;
    top = Math.min(top, staffTop);
    bottom = Math.max(bottom, staffBottom);
    staffHeight = Math.max(staffHeight, staffBottom - staffTop);
  }
  if (right <= left || bottom <= top) return;

  // Room for the notes just above and below the staves.
  const margin = staffHeight * 0.4;
  const background = document.createElementNS(SVG_NAMESPACE, 'rect');
  background.setAttribute('class', BACKGROUND_CLASS);
  background.setAttribute('x', String(left));
  background.setAttribute('y', String(top - margin));
  background.setAttribute('width', String(right - left));
  background.setAttribute('height', String(bottom - top + 2 * margin));
  background.setAttribute('rx', String(staffHeight * 0.14));
  measure.insertBefore(background, measure.firstChild);
}

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
  const handMode = usePlayer((state) => state.handMode);
  const loop = usePlayer((state) => state.loop);
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

  // Give every measure of a fresh engraving its box. This runs before the effects that mark
  // the playhead and the loop, which only set classes on the measures.
  useLayoutEffect(() => {
    if (!sections) return;
    container.current?.querySelectorAll<SVGGElement>('g.measure').forEach(addBackground);
  }, [sections]);

  // Mark the measures of a loop.
  useEffect(() => {
    if (!loop.enabled || !sections) return;
    const marked: Element[] = [];
    for (let index = loop.from; index <= loop.to; index += 1) {
      const element = document.getElementById(measureElementId(index));
      if (!element) continue;
      element.classList.add(LOOP_CLASS);
      marked.push(element);
    }
    return () => marked.forEach((element) => element.classList.remove(LOOP_CLASS));
  }, [loop, sections]);

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

  // A click between the notes belongs to no element of the engraving; the staves decide.
  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const index = measureAtPoint(event.target, event.currentTarget, event.clientX, event.clientY);
    if (index !== null) seekToMeasure(index);
  };

  return (
    <div
      ref={container}
      className={cx(
        'sheet',
        'staff-view',
        printing && 'sheet--print',
        !printing && handMode !== 'both' && `sheet--hear-${handMode}`,
      )}
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
          className={cx(
            'sheet__section',
            section.kind !== 'song' && `sheet__section--aside sheet__section--${section.kind}`,
          )}
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

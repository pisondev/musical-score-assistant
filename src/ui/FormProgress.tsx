import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formStretches, stretchAt, type Performance } from '../core';
import { usePlayer } from '../store/player';
import { cx } from './classnames';
import { placeLabels, sameLayout, type LabelLayout } from './progress-labels';
import { scrollToMeasure, viewedPosition } from './view-position';

/** The reader's place in measures, followed while the page scrolls and its layout changes. */
function useViewedPosition(performance: Performance): number {
  const total = performance.song.measures.length;
  const [position, setPosition] = useState(0);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setPosition(Math.round(viewedPosition(total) * 100) / 100);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The staff view arrives late, and a different left hand changes the height of the sheet.
    const observer = new ResizeObserver(schedule);
    const page = document.querySelector('.page');
    if (page) observer.observe(page);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, [performance, total]);

  return position;
}

/**
 * Places the names of the parts over their stretches, as the phone shows them, and measures
 * again whenever the bar changes width. Where the names are not shown (wider screens), there
 * is nothing to place.
 */
function useLabelLayout(current: number, key: unknown) {
  const track = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LabelLayout | null>(null);

  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => {
      const names = [...element.querySelectorAll<HTMLElement>('.form-progress__name')];
      const stretches = [...element.querySelectorAll<HTMLElement>('.form-progress__stretch')];
      // Hidden names have no box to measure.
      const next =
        names.length === 0 || names[0].offsetParent === null
          ? null
          : placeLabels(
              stretches.map((stretch) => ({
                start: stretch.offsetLeft,
                width: stretch.offsetWidth,
              })),
              names.map((name) => name.offsetWidth),
              current,
              element.clientWidth,
            );
      setLayout((previous) => (sameLayout(previous, next) ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [current, key]);

  return { track, layout };
}

/**
 * A small progress bar under the controls that says where one is in the
 * piece: "Intro", "Song (verse)", "Song (refrain)", "Ending". While the music
 * plays it follows the playhead; otherwise it follows the part of the sheet
 * that is in view. Each stretch of the bar leads to its part of the piece.
 *
 * On a wide screen the name of the current part stands at the left of the bar. On a phone
 * every part has its name over its stretch, small and grey, with the current one larger and
 * in colour; the bar itself closes the top bar, and the controls passed as children float
 * below it.
 */
export function FormProgress({
  performance,
  children,
}: {
  performance: Performance;
  /** Controls at the right end of the strip, such as the size of the score. */
  children?: ReactNode;
}) {
  const stretches = useMemo(() => formStretches(performance), [performance]);
  const total = performance.song.measures.length;
  const viewed = useViewedPosition(performance);
  const playing = usePlayer((state) => state.status === 'playing');
  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const seekToMeasure = usePlayer((state) => state.seekToMeasure);

  // Measures that are behind: the one being played counts, so the last measure fills the bar.
  const position = playing ? currentMeasure + 1 : viewed;
  const measure = playing ? currentMeasure : Math.min(total - 1, Math.floor(viewed));
  const current = stretchAt(stretches, measure);
  const { track, layout } = useLabelLayout(current, stretches);
  if (stretches.length === 0) return null;

  return (
    <nav className="form-progress" aria-label="Parts of the piece">
      <span className="form-progress__label" title={stretches[current].label}>
        {stretches[current].label}
      </span>
      <div className="form-progress__track" ref={track}>
        <div className="form-progress__names" aria-hidden="true">
          {stretches.map((stretch, index) => (
            <span
              key={stretch.start}
              className={cx(
                'form-progress__name',
                `form-progress__name--${stretch.kind}`,
                index === current && 'is-current',
                (!layout || !layout.shown[index]) && 'is-hidden',
              )}
              style={layout ? { left: layout.left[index] } : undefined}
            >
              {stretch.label}
            </span>
          ))}
        </div>
        {stretches.map((stretch, index) => {
          const done = Math.min(1, Math.max(0, (position - stretch.start) / stretch.count));
          return (
            <button
              key={stretch.start}
              type="button"
              className={cx(
                'form-progress__stretch',
                `form-progress__stretch--${stretch.kind}`,
                index === current && 'is-current',
              )}
              style={{ flexGrow: stretch.count }}
              title={`Go to: ${stretch.label}`}
              aria-label={`Go to: ${stretch.label}`}
              aria-current={index === current ? 'step' : undefined}
              onClick={() => {
                seekToMeasure(stretch.start);
                // While the music plays, the sheet follows the playhead by itself.
                if (!playing) scrollToMeasure(stretch.start);
              }}
            >
              <span className="form-progress__rail">
                <span className="form-progress__fill" style={{ width: `${done * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      {children && <div className="form-progress__tools">{children}</div>}
    </nav>
  );
}

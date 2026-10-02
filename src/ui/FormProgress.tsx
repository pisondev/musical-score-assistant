import { useEffect, useMemo, useState } from 'react';
import { formStretches, stretchAt, type Performance } from '../core';
import { usePlayer } from '../store/player';
import { cx } from './classnames';
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
 * A small progress bar under the controls that says where one is in the
 * piece: "Intro", "Song (verse)", "Song (refrain)", "Ending". While the music
 * plays it follows the playhead; otherwise it follows the part of the sheet
 * that is in view. Each stretch of the bar leads to its part of the piece.
 */
export function FormProgress({ performance }: { performance: Performance }) {
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
  if (stretches.length === 0) return null;

  return (
    <nav className="form-progress" aria-label="Parts of the piece">
      <span className="form-progress__label" title={stretches[current].label}>
        {stretches[current].label}
      </span>
      <div className="form-progress__track">
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
    </nav>
  );
}

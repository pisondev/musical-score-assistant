import type { Performance } from '../core';
import { usePlayer } from '../store/player';
import { cx } from './classnames';

interface GuideProps {
  performance: Performance;
}

const LEVEL_LABEL = { easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

/** Explains the selected arrangement: what is new, how to practise it, and why each measure changed. */
export function Guide({ performance }: GuideProps) {
  const { song, arrangement, introMeasures } = performance;
  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const status = usePlayer((state) => state.status);
  const seekToMeasure = usePlayer((state) => state.seekToMeasure);
  const active = status === 'playing' || status === 'paused';

  const notes = arrangement.measures
    .map((part, index) => {
      const measure = song.measures[index];
      const label =
        measure.part === 'intro'
          ? `i${index + 1}`
          : measure.number === null
            ? '–'
            : `${measure.number}`;
      return { index, label, text: part.note };
    })
    .filter((entry): entry is { index: number; label: string; text: string } =>
      Boolean(entry.text),
    );

  return (
    <aside className="guide" aria-label="About this arrangement">
      <header className="guide__header">
        <h2>{arrangement.name}</h2>
        <p className="guide__tags">
          <span className="tag">{LEVEL_LABEL[arrangement.level]}</span>
          {arrangement.style && <span className="tag">{arrangement.style}</span>}
        </p>
        <p>{arrangement.summary}</p>
      </header>

      {arrangement.baseline && (
        <p className="guide__hint">
          This is the pattern you already play. Pick another left hand, then switch back here at any
          time to compare.
        </p>
      )}

      {arrangement.patterns.length > 0 && (
        <section>
          <h3>New ideas</h3>
          <ul className="patterns">
            {arrangement.patterns.map((pattern) => (
              <li key={pattern.name}>
                <strong>{pattern.name}</strong>
                <code>{pattern.notation}</code>
                <p>{pattern.description}</p>
              </li>
            ))}
          </ul>
          <p className="guide__footnote">
            Pattern digits count from the chord root: 1 is the root, 5 the fifth, 1&prime; the root
            an octave higher. Angle brackets strike notes together.
          </p>
        </section>
      )}

      {arrangement.tips.length > 0 && (
        <section>
          <h3>Practice tips</h3>
          <ul className="tips">
            {arrangement.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section>
          <h3>Measure by measure</h3>
          <ol className="measure-notes">
            {notes.map((note) => (
              <li key={note.index}>
                <button
                  type="button"
                  className={cx(active && note.index === currentMeasure && 'is-current')}
                  onClick={() => seekToMeasure(note.index)}
                >
                  <span className="measure-notes__number">{note.label}</span>
                  <span>{note.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {introMeasures > 0 && notes.every((note) => note.index >= introMeasures) && (
        <p className="guide__footnote">
          The introduction uses the closing phrase of the song, so its notes are explained with the
          measures it is taken from.
        </p>
      )}
    </aside>
  );
}

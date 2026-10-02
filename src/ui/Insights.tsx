import type { Arrangement, Song } from '../core';
import { usePlayer } from '../store/player';
import { cx } from './classnames';

interface InsightsProps {
  song: Song;
  arrangement: Arrangement;
}

/** Explains the selected arrangement: what is new, how to practise it, and why each measure changed. */
export function Insights({ song, arrangement }: InsightsProps) {
  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const status = usePlayer((state) => state.status);
  const seekToMeasure = usePlayer((state) => state.seekToMeasure);
  const active = status === 'playing' || status === 'paused';

  const notes = arrangement.measures
    .map((part, index) => ({ index, number: song.measures[index].number, text: part.note }))
    .filter((entry): entry is { index: number; number: number | null; text: string } =>
      Boolean(entry.text),
    );

  return (
    <aside className="insights" aria-label="About this arrangement">
      <header className="insights__header">
        <h2>{arrangement.name}</h2>
        <p>{arrangement.summary}</p>
      </header>

      {arrangement.baseline && (
        <p className="insights__hint">
          Choose one of the suggestions above, then switch back here at any time to compare it with
          what you play today.
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
          <p className="insights__footnote">
            Pattern digits count from the chord root: 1 is the root, 5 the fifth, 1&prime; the root
            an octave higher.
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
                  <span className="measure-notes__number">{note.number ?? '–'}</span>
                  <span>{note.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}

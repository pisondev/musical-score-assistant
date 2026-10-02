import type { Arrangement } from '../core';
import { cx } from './classnames';

interface ArrangementPickerProps {
  arrangements: Arrangement[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const LEVEL_LABEL = { easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

function chordChangeLabel(arrangement: Arrangement): string {
  if (arrangement.baseline) return 'Your pattern';
  const changed = arrangement.measures
    .flatMap((measure) => measure.chords)
    .filter((chord) => chord.changed).length;
  if (changed === 0) return 'Printed chords';
  return `${changed} chord${changed === 1 ? '' : 's'} changed`;
}

/** Lets the player switch between the baseline and each suggested left hand. */
export function ArrangementPicker({ arrangements, selectedId, onSelect }: ArrangementPickerProps) {
  return (
    <div className="picker" role="radiogroup" aria-label="Left-hand arrangement">
      {arrangements.map((arrangement, index) => {
        const selected = arrangement.id === selectedId;
        return (
          <button
            key={arrangement.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cx('picker__option', selected && 'is-selected')}
            onClick={() => onSelect(arrangement.id)}
          >
            <span className="picker__index">{index === 0 ? '0' : index}</span>
            <span className="picker__text">
              <span className="picker__name">{arrangement.name}</span>
              <span className="picker__meta">
                {LEVEL_LABEL[arrangement.level]} · {chordChangeLabel(arrangement)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

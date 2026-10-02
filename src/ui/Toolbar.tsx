import {
  formatNoteName,
  type Arrangement,
  type IntroChoice,
  type Level,
  type NoteName,
  type SongBundle,
} from '../core';
import { useSettings } from '../store/settings';
import { cx } from './classnames';
import { BookIcon, CheckIcon, MinusIcon, PlusIcon, PrinterIcon } from './icons';
import { Popover } from './Popover';

export const MAX_TRANSPOSE = 6;

const LEVELS: { level: Level; label: string; hint: string }[] = [
  { level: 'easy', label: 'Easy', hint: 'Single notes and small shapes' },
  { level: 'intermediate', label: 'Intermediate', hint: 'New chords and busier patterns' },
  { level: 'advanced', label: 'Advanced', hint: 'Wide reaches, leaps, and rich harmony' },
];

const LEVEL_LABEL: Record<Level, string> = {
  easy: 'Easy',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

interface ToolbarProps {
  bundle: SongBundle;
  arrangement: Arrangement;
  onSelectArrangement: (id: string) => void;
  /** The introduction in effect, after falling back when one is unavailable. */
  intro: IntroChoice;
  semitones: number;
  onTranspose: (semitones: number) => void;
  /** The key after transposing. */
  soundingKey: NoteName;
  onPrint: () => void;
}

function LeftHandMenu({
  bundle,
  arrangement,
  onSelectArrangement,
}: Pick<ToolbarProps, 'bundle' | 'arrangement' | 'onSelectArrangement'>) {
  return (
    <Popover
      label="Left hand"
      wide
      value={
        <>
          {arrangement.name}
          <span className="popover__detail">
            {LEVEL_LABEL[arrangement.level]}
            {arrangement.style && ` · ${arrangement.style}`}
          </span>
        </>
      }
    >
      {(close) => (
        <div className="levels" role="radiogroup" aria-label="Left-hand arrangement">
          {LEVELS.map(({ level, label, hint }) => {
            const options = bundle.arrangements.filter((candidate) => candidate.level === level);
            return (
              <section key={level} className="levels__column">
                <header>
                  <h3>{label}</h3>
                  <p>{hint}</p>
                </header>
                {options.length === 0 && <p className="levels__empty">Nothing here yet.</p>}
                {options.map((option) => {
                  const selected = option.id === arrangement.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={cx('option', selected && 'is-selected')}
                      onClick={() => {
                        onSelectArrangement(option.id);
                        close();
                      }}
                    >
                      <span className="option__title">
                        {option.name}
                        {option.style && <span className="tag">{option.style}</span>}
                      </span>
                      <span className="option__summary">{option.summary}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

const INTRO_LABEL: Record<IntroChoice, string> = {
  off: 'Off',
  'last-phrase': 'Last phrase',
  improvised: 'Improvised',
};

function IntroMenu({ bundle, intro }: Pick<ToolbarProps, 'bundle' | 'intro'>) {
  const setIntro = useSettings((state) => state.setIntro);
  const improvised = bundle.intro.improvised;
  const options: { choice: IntroChoice; description: string; disabled?: boolean }[] = [
    { choice: 'off', description: 'Start directly with the song.' },
    {
      choice: 'last-phrase',
      description: 'The closing phrase of the song, played with the selected left hand.',
    },
    {
      choice: 'improvised',
      description: improvised
        ? improvised.summary || 'A newly written introduction for this song.'
        : 'No improvised introduction has been written for this song yet.',
      disabled: !improvised,
    },
  ];

  return (
    <Popover label="Intro" value={INTRO_LABEL[intro]}>
      {(close) => (
        <div className="menu" role="radiogroup" aria-label="Introduction">
          {options.map(({ choice, description, disabled }) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={intro === choice}
              disabled={disabled}
              className={cx('option', intro === choice && 'is-selected')}
              onClick={() => {
                setIntro(choice);
                close();
              }}
            >
              <span className="option__title">{INTRO_LABEL[choice]}</span>
              <span className="option__summary">{description}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function ViewMenu() {
  const showLyrics = useSettings((state) => state.showLyrics);
  const showDynamics = useSettings((state) => state.showDynamics);
  const toggleLyrics = useSettings((state) => state.toggleLyrics);
  const toggleDynamics = useSettings((state) => state.toggleDynamics);
  const items = [
    { label: 'Lyrics', checked: showLyrics, toggle: toggleLyrics },
    { label: 'Dynamics', checked: showDynamics, toggle: toggleDynamics },
  ];
  const shown = items.filter((item) => item.checked).map((item) => item.label);

  return (
    <Popover label="Show" value={shown.length > 0 ? shown.join(', ') : 'Notes only'}>
      {() => (
        <div className="menu">
          {items.map(({ label, checked, toggle }) => (
            <button
              key={label}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              className="check"
              onClick={toggle}
            >
              <span className={cx('check__box', checked && 'is-checked')}>
                {checked && <CheckIcon width={12} height={12} />}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function TransposeControl({
  semitones,
  onTranspose,
  soundingKey,
}: Pick<ToolbarProps, 'semitones' | 'onTranspose' | 'soundingKey'>) {
  const offset =
    semitones === 0 ? 'original' : `${semitones > 0 ? '+' : '−'}${Math.abs(semitones)}`;
  return (
    <div className="stepper" role="group" aria-label="Transpose">
      <button
        type="button"
        onClick={() => onTranspose(semitones - 1)}
        disabled={semitones <= -MAX_TRANSPOSE}
        aria-label="Transpose down a half step"
        title="Down a half step"
      >
        <MinusIcon width={14} height={14} />
      </button>
      <button
        type="button"
        className="stepper__value"
        onClick={() => onTranspose(0)}
        title="Return to the original key"
      >
        <span className="popover__label">Key</span>
        <span className="popover__value">
          1 = {formatNoteName(soundingKey)}
          <span className="popover__detail">{offset}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onTranspose(semitones + 1)}
        disabled={semitones >= MAX_TRANSPOSE}
        aria-label="Transpose up a half step"
        title="Up a half step"
      >
        <PlusIcon width={14} height={14} />
      </button>
    </div>
  );
}

/** The controls that decide what is on the sheet: left hand, intro, key, and visible rows. */
export function Toolbar(props: ToolbarProps) {
  const guideOpen = useSettings((state) => state.guideOpen);
  const toggleGuide = useSettings((state) => state.toggleGuide);

  return (
    <div className="toolbar" aria-label="Score options">
      <LeftHandMenu
        bundle={props.bundle}
        arrangement={props.arrangement}
        onSelectArrangement={props.onSelectArrangement}
      />
      <IntroMenu bundle={props.bundle} intro={props.intro} />
      <TransposeControl
        semitones={props.semitones}
        onTranspose={props.onTranspose}
        soundingKey={props.soundingKey}
      />
      <ViewMenu />
      <div className="toolbar__spacer" />
      <button
        type="button"
        className={cx('button', 'button--toggle', guideOpen && 'is-on')}
        onClick={toggleGuide}
        aria-pressed={guideOpen}
        title="Explain this arrangement"
      >
        <BookIcon width={18} height={18} />
        <span>Guide</span>
      </button>
      <button
        type="button"
        className="button"
        onClick={props.onPrint}
        title="Print the score or save it as a PDF"
      >
        <PrinterIcon width={18} height={18} />
        <span>Print / PDF</span>
      </button>
    </div>
  );
}

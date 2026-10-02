import {
  formatNoteName,
  INTRO_LAST_PHRASE,
  INTRO_OFF,
  type Arrangement,
  type IntroChoice,
  type Level,
  type NoteName,
  type RightHandMode,
  type SongBundle,
} from '../core';
import { useSettings, type Notation } from '../store/settings';
import { cx } from './classnames';
import { introName } from './intro-name';
import { BookIcon, CheckIcon, DownloadIcon, MinusIcon, PlusIcon, PrinterIcon } from './icons';
import { Popover } from './Popover';
import { RIGHT_HAND_NAME } from './right-hand-name';

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

const RIGHT_HAND_OPTIONS: { mode: RightHandMode; description: string }[] = [
  { mode: 'melody', description: 'The printed melody, note for note.' },
  {
    mode: 'fills',
    description: 'The printed melody stays as it is; fills are added where it waits.',
  },
  {
    mode: 'accompaniment',
    description:
      'For accompanying singers: chords, rhythm, and fills. The melody is left to the voices.',
  },
];

const NOTATIONS: { notation: Notation; label: string; hint: string }[] = [
  { notation: 'numbers', label: '1 2 3', hint: 'Numbered notation' },
  { notation: 'staff', label: 'Staff', hint: 'Staff notation on a grand staff' },
];

interface ToolbarProps {
  bundle: SongBundle;
  arrangement: Arrangement;
  onSelectArrangement: (id: string) => void;
  /** What the right hand plays, after falling back when a part is not written. */
  rightHand: RightHandMode;
  /** The introduction in effect, after falling back when one is unavailable. */
  intro: IntroChoice;
  semitones: number;
  onTranspose: (semitones: number) => void;
  /** The key after transposing. */
  soundingKey: NoteName;
  onPrint: () => void;
  onDownloadMidi: () => void;
  onDownloadMp3: () => void;
  /** Progress of an MP3 that is being made, or null when none is. */
  exportStatus: string | null;
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

function RightHandMenu({
  arrangement,
  rightHand,
}: Pick<ToolbarProps, 'arrangement' | 'rightHand'>) {
  const setRightHand = useSettings((state) => state.setRightHand);
  return (
    <Popover label="Right hand" value={RIGHT_HAND_NAME[rightHand]}>
      {(close) => (
        <div className="menu" role="radiogroup" aria-label="Right hand">
          {RIGHT_HAND_OPTIONS.map(({ mode, description }) => {
            const written = mode === 'melody' || arrangement.rightHand[mode] !== undefined;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={rightHand === mode}
                className={cx('option', rightHand === mode && 'is-selected')}
                disabled={!written}
                onClick={() => {
                  setRightHand(mode);
                  close();
                }}
              >
                <span className="option__title">{RIGHT_HAND_NAME[mode]}</span>
                <span className="option__summary">
                  {written ? description : 'Not written for this left hand yet.'}
                </span>
              </button>
            );
          })}
          <p className="menu__note">
            Fills and accompaniment are written for each left hand, so they follow its chords and
            share the gaps with its fills. Now paired with: {arrangement.name}.
          </p>
        </div>
      )}
    </Popover>
  );
}

function IntroMenu({ bundle, intro }: Pick<ToolbarProps, 'bundle' | 'intro'>) {
  const setIntro = useSettings((state) => state.setIntro);
  const options: { choice: IntroChoice; name: string; style?: string; description: string }[] = [
    { choice: INTRO_OFF, name: 'Off', description: 'Start directly with the song.' },
    {
      choice: INTRO_LAST_PHRASE,
      name: 'Last phrase',
      description: 'The closing phrase of the song, played with the selected left hand.',
    },
    ...bundle.intro.written.map((written) => ({
      choice: written.id,
      name: written.name,
      style: written.style,
      description: written.summary,
    })),
  ];

  return (
    <Popover label="Intro" value={introName(bundle, intro)}>
      {(close) => (
        <div className="menu menu--scroll" role="radiogroup" aria-label="Introduction">
          {options.map(({ choice, name, style, description }) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={intro === choice}
              className={cx('option', intro === choice && 'is-selected')}
              onClick={() => {
                setIntro(choice);
                close();
              }}
            >
              <span className="option__title">
                {name}
                {style && <span className="tag">{style}</span>}
              </span>
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

function NotationSwitch() {
  const notation = useSettings((state) => state.notation);
  const setNotation = useSettings((state) => state.setNotation);
  return (
    <div className="switch" role="radiogroup" aria-label="Notation">
      {NOTATIONS.map((option) => (
        <button
          key={option.notation}
          type="button"
          role="radio"
          aria-checked={notation === option.notation}
          className={cx(notation === option.notation && 'is-selected')}
          onClick={() => setNotation(option.notation)}
          title={option.hint}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DownloadMenu({
  onDownloadMidi,
  onDownloadMp3,
  exportStatus,
}: Pick<ToolbarProps, 'onDownloadMidi' | 'onDownloadMp3' | 'exportStatus'>) {
  const options = [
    {
      name: 'MIDI',
      extension: '.mid',
      description:
        'The notes themselves, one track per hand and one for the voice guide. For a keyboard or a music program.',
      action: onDownloadMidi,
    },
    {
      name: 'MP3',
      extension: '.mp3',
      description: 'A recording with the piano sound of this app. For a phone or any audio player.',
      action: onDownloadMp3,
    },
  ];

  return (
    <Popover
      label="Download"
      align="right"
      value={
        exportStatus ?? (
          <>
            <DownloadIcon width={15} height={15} />
            MIDI, MP3
          </>
        )
      }
    >
      {(close) => (
        <div className="menu">
          {options.map(({ name, extension, description, action }) => (
            <button
              key={name}
              type="button"
              className="option"
              disabled={exportStatus !== null}
              onClick={() => {
                close();
                action();
              }}
            >
              <span className="option__title">
                {name}
                <span className="tag">{extension}</span>
              </span>
              <span className="option__summary">{description}</span>
            </button>
          ))}
          <p className="menu__note">
            Both contain what is on the sheet: the intro, both hands as chosen, the key, and the
            dynamics, at the current tempo and with what is switched on in the bar below.
          </p>
        </div>
      )}
    </Popover>
  );
}

/** The controls that decide what is on the sheet: both hands, intro, key, notation, and rows. */
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
      <RightHandMenu arrangement={props.arrangement} rightHand={props.rightHand} />
      <IntroMenu bundle={props.bundle} intro={props.intro} />
      <TransposeControl
        semitones={props.semitones}
        onTranspose={props.onTranspose}
        soundingKey={props.soundingKey}
      />
      <ViewMenu />
      <NotationSwitch />
      {/* Kept together, so they move to a row of their own when the window is narrow. */}
      <div className="toolbar__actions">
        <button
          type="button"
          className={cx('button', 'button--toggle', guideOpen && 'is-on')}
          onClick={toggleGuide}
          aria-pressed={guideOpen}
          aria-label="Guide"
          title="Explain this arrangement"
        >
          <BookIcon width={18} height={18} />
          <span>Guide</span>
        </button>
        <button
          type="button"
          className="button"
          onClick={props.onPrint}
          aria-label="Print / PDF"
          title="Print the score or save it as a PDF"
        >
          <PrinterIcon width={18} height={18} />
          <span>Print / PDF</span>
        </button>
        <DownloadMenu
          onDownloadMidi={props.onDownloadMidi}
          onDownloadMp3={props.onDownloadMp3}
          exportStatus={props.exportStatus}
        />
      </div>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import {
  ENDING_OFF,
  formatNoteName,
  INTRO_LAST_PHRASE,
  INTRO_OFF,
  keyShift,
  type Arrangement,
  type EndingChoice,
  type IntroChoice,
  type Level,
  type NoteName,
  type RightHandMode,
  type SongBundle,
} from '../core';
import { useSettings, type Notation } from '../store/settings';
import { cx } from './classnames';
import { introName } from './intro-name';
import {
  BookIcon,
  CheckIcon,
  ChevronIcon,
  DownloadIcon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  SlidersIcon,
} from './icons';
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

const LIFTS: { lift: number; name: string; value: string }[] = [
  { lift: 1, name: 'Up a half step', value: 'Up a half step' },
  { lift: 2, name: 'Up a whole step', value: 'Up a whole step' },
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
  /** Whether the chords under the melody are on the sheet. */
  chords: boolean;
  /** The introduction in effect, after falling back when one is unavailable. */
  intro: IntroChoice;
  /** The ending in effect, after falling back when one is unavailable. */
  ending: EndingChoice;
  /** Half steps by which the key rises for the repeat; 0 when the song is played once. */
  lift: number;
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

interface Choice<Value> {
  value: Value;
  name: string;
  tag?: string;
  description: string;
  disabled?: boolean;
}

/** A list of choices of which exactly one is selected. */
function Choices<Value extends string | number>({
  label,
  choices,
  selected,
  onSelect,
}: {
  label: string;
  choices: Choice<Value>[];
  selected: Value;
  onSelect: (value: Value) => void;
}) {
  return (
    <div className="menu" role="radiogroup" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={selected === choice.value}
          className={cx('option', selected === choice.value && 'is-selected')}
          disabled={choice.disabled}
          onClick={() => onSelect(choice.value)}
        >
          <span className="option__title">
            {choice.name}
            {choice.tag && <span className="tag">{choice.tag}</span>}
          </span>
          <span className="option__summary">{choice.description}</span>
        </button>
      ))}
    </div>
  );
}

function LeftHandChoices({
  bundle,
  arrangement,
  onSelectArrangement,
}: Pick<ToolbarProps, 'bundle' | 'arrangement' | 'onSelectArrangement'>) {
  return (
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
                  onClick={() => onSelectArrangement(option.id)}
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
  );
}

function RightHandChoices({
  arrangement,
  rightHand,
}: Pick<ToolbarProps, 'arrangement' | 'rightHand'>) {
  const setRightHand = useSettings((state) => state.setRightHand);
  const wantsChords = useSettings((state) => state.chords);
  const toggleChords = useSettings((state) => state.toggleChords);
  const chordsWritten = arrangement.rightHand.harmony !== undefined;
  const chordsPossible = chordsWritten && rightHand !== 'accompaniment';
  const checked = wantsChords && chordsPossible;
  return (
    <>
      <Choices
        label="Right hand"
        selected={rightHand}
        onSelect={setRightHand}
        choices={RIGHT_HAND_OPTIONS.map(({ mode, description }) => {
          const written = mode === 'melody' || arrangement.rightHand[mode] !== undefined;
          return {
            value: mode,
            name: RIGHT_HAND_NAME[mode],
            description: written ? description : 'Not written for this left hand yet.',
            disabled: !written,
          };
        })}
      />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        className="check check--described"
        disabled={!chordsPossible}
        onClick={toggleChords}
      >
        <span className={cx('check__box', checked && 'is-checked')}>
          {checked && <CheckIcon width={12} height={12} />}
        </span>
        <span>
          Chords under the melody
          <span className="option__summary">
            {!chordsWritten
              ? 'Not written for this left hand yet.'
              : rightHand === 'accompaniment'
                ? 'An accompaniment has its own chords.'
                : 'On the downbeats, the long notes, and the starts of phrases the right hand plays a full chord with the melody on top, so it never sounds thin.'}
          </span>
        </span>
      </button>
      <p className="menu__note">
        Chords, fills, and accompaniment are written for each left hand, so they follow its chords
        and share the gaps with its fills. Now paired with: {arrangement.name}.
      </p>
    </>
  );
}

function IntroChoices({ bundle, intro }: Pick<ToolbarProps, 'bundle' | 'intro'>) {
  const setIntro = useSettings((state) => state.setIntro);
  return (
    <Choices
      label="Introduction"
      selected={intro}
      onSelect={setIntro}
      choices={[
        { value: INTRO_OFF, name: 'Off', description: 'Start directly with the song.' },
        {
          value: INTRO_LAST_PHRASE,
          name: 'Last phrase',
          description: bundle.intro.bridge
            ? 'The closing phrase of the song, played with the selected left hand, then a bridge that leads into the first measure.'
            : 'The closing phrase of the song, played with the selected left hand.',
        },
        ...bundle.intro.written.map((written) => ({
          value: written.id,
          name: written.name,
          tag: written.style,
          description: written.summary,
        })),
      ]}
    />
  );
}

function EndingChoices({ bundle, ending }: Pick<ToolbarProps, 'bundle' | 'ending'>) {
  const setEnding = useSettings((state) => state.setEnding);
  return (
    <>
      <Choices
        label="Ending"
        selected={ending}
        onSelect={setEnding}
        choices={[
          {
            value: ENDING_OFF,
            name: 'Off',
            description: 'Stop with the last measure of the song.',
          },
          ...bundle.endings.map((written) => ({
            value: written.id,
            name: written.name,
            tag: written.style,
            description: written.summary,
          })),
        ]}
      />
      {bundle.endings.length === 0 && (
        <p className="menu__note">No ending has been written for this song yet.</p>
      )}
    </>
  );
}

function RepeatChoices({
  bundle,
  lift,
  intro,
  soundingKey,
}: Pick<ToolbarProps, 'bundle' | 'lift' | 'intro' | 'soundingKey'>) {
  const setLift = useSettings((state) => state.setLift);
  const between = [
    bundle.modulation && 'the key lift',
    intro !== INTRO_OFF && 'the intro again',
  ].filter(Boolean);
  return (
    <>
      <Choices
        label="Repeat in a higher key"
        selected={lift}
        onSelect={setLift}
        choices={[
          { value: 0, name: 'Off', description: 'Play the song once.' },
          ...LIFTS.map((option) => ({
            value: option.lift,
            name: option.name,
            description: `Play the song a second time in 1 = ${formatNoteName(keyShift(soundingKey, option.lift).key)}.`,
          })),
        ]}
      />
      <p className="menu__note">
        A modulation: the song is repeated in a higher key, and the score continues below the first
        time through.{' '}
        {between.length > 0
          ? `Between the two, an interlude plays ${between.join(', then ')}.`
          : 'The new key starts directly; choose an intro to get an interlude between the two.'}
      </p>
    </>
  );
}

function ShowChoices() {
  const showLyrics = useSettings((state) => state.showLyrics);
  const showDynamics = useSettings((state) => state.showDynamics);
  const toggleLyrics = useSettings((state) => state.toggleLyrics);
  const toggleDynamics = useSettings((state) => state.toggleDynamics);
  const items = [
    { label: 'Lyrics', checked: showLyrics, toggle: toggleLyrics },
    { label: 'Dynamics', checked: showDynamics, toggle: toggleDynamics },
  ];
  return (
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
  );
}

function TransposeControl({
  semitones,
  onTranspose,
  soundingKey,
}: Pick<ToolbarProps, 'semitones' | 'onTranspose' | 'soundingKey'>) {
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
        1 = {formatNoteName(soundingKey)}
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

type SectionId = 'left' | 'right' | 'intro' | 'ending' | 'repeat' | 'show';

interface SectionProps {
  label: string;
  /** The choice in effect, shown while the section is closed and open alike. */
  value: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** One setting of the score: a line with its current value that opens to show the choices. */
function Section({ label, value, open, onToggle, children }: SectionProps) {
  return (
    <section className={cx('setting', open && 'is-open')}>
      <button type="button" className="setting__head" aria-expanded={open} onClick={onToggle}>
        <span className="setting__label">{label}</span>
        <span className="setting__value">{value}</span>
        <ChevronIcon width={14} height={14} className="setting__chevron" />
      </button>
      {open && <div className="setting__body">{children}</div>}
    </section>
  );
}

/**
 * Everything that decides what is on the sheet, as one list: each setting is
 * a line with its current value, and a click opens its choices.
 */
function ScoreSettings(props: ToolbarProps) {
  const [open, setOpen] = useState<SectionId | null>(null);
  const showLyrics = useSettings((state) => state.showLyrics);
  const showDynamics = useSettings((state) => state.showDynamics);
  const { bundle, arrangement, rightHand, chords, intro, ending, lift, semitones } = props;
  const section = (id: SectionId) => ({
    open: open === id,
    onToggle: () => setOpen((current) => (current === id ? null : id)),
  });
  const endingName = bundle.endings.find((written) => written.id === ending)?.name ?? 'Off';
  const shown = [showLyrics && 'Lyrics', showDynamics && 'Dynamics'].filter(Boolean);
  const offset =
    semitones === 0 ? 'original key' : `${semitones > 0 ? '+' : '−'}${Math.abs(semitones)}`;

  return (
    <div className="settings">
      <Section
        label="Left hand"
        value={
          <>
            {arrangement.name}
            <span className="setting__detail">
              {LEVEL_LABEL[arrangement.level]}
              {arrangement.style && ` · ${arrangement.style}`}
            </span>
          </>
        }
        {...section('left')}
      >
        <LeftHandChoices
          bundle={bundle}
          arrangement={arrangement}
          onSelectArrangement={props.onSelectArrangement}
        />
      </Section>
      <Section
        label="Right hand"
        value={
          <>
            {RIGHT_HAND_NAME[rightHand]}
            {chords && <span className="setting__detail">with chords</span>}
          </>
        }
        {...section('right')}
      >
        <RightHandChoices arrangement={arrangement} rightHand={rightHand} />
      </Section>
      <Section label="Intro" value={introName(bundle, intro)} {...section('intro')}>
        <IntroChoices bundle={bundle} intro={intro} />
      </Section>
      <Section label="Ending" value={endingName} {...section('ending')}>
        <EndingChoices bundle={bundle} ending={ending} />
      </Section>
      <Section
        label="Repeat"
        value={LIFTS.find((option) => option.lift === lift)?.value ?? 'Off'}
        {...section('repeat')}
      >
        <RepeatChoices bundle={bundle} lift={lift} intro={intro} soundingKey={props.soundingKey} />
      </Section>
      <div className="setting setting--inline">
        <span className="setting__label">Key</span>
        <span className="setting__value">
          <span className="setting__detail">{offset}</span>
        </span>
        <TransposeControl
          semitones={semitones}
          onTranspose={props.onTranspose}
          soundingKey={props.soundingKey}
        />
      </div>
      <Section
        label="Show"
        value={shown.length > 0 ? shown.join(', ') : 'Notes only'}
        {...section('show')}
      >
        <ShowChoices />
      </Section>
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
      compact
      align="right"
      value={
        exportStatus ?? (
          <>
            <DownloadIcon width={17} height={17} />
            <span>Download</span>
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
            Both contain what is on the sheet: the intro, both hands as chosen, the key, the repeat,
            the ending, and the dynamics, at the current tempo and with what is switched on in the
            bar below.
          </p>
        </div>
      )}
    </Popover>
  );
}

/**
 * The controls of a song in the top bar. One button opens every setting of
 * the score (both hands, intro, ending, repeat, key, and visible rows) as a
 * list in which a click shows the choices of one setting; next to it are the
 * notation switch, the guide, printing, and downloads.
 */
export function Toolbar(props: ToolbarProps) {
  const guideOpen = useSettings((state) => state.guideOpen);
  const toggleGuide = useSettings((state) => state.toggleGuide);
  const { arrangement, rightHand, chords, soundingKey } = props;
  const extras = [
    props.intro !== INTRO_OFF && 'intro',
    props.lift > 0 && 'repeat',
    props.ending !== ENDING_OFF && 'ending',
  ].filter(Boolean);

  return (
    <div className="toolbar" aria-label="Score options">
      <Popover
        label="Options"
        icon={<SlidersIcon width={17} height={17} />}
        align="right"
        value={
          <>
            {arrangement.name}
            <span className="popover__detail">
              {RIGHT_HAND_NAME[rightHand]}
              {chords && ' with chords'} · 1 = {formatNoteName(soundingKey)}
              {extras.length > 0 && ` · ${extras.join(', ')}`}
            </span>
          </>
        }
        wide
      >
        {() => <ScoreSettings {...props} />}
      </Popover>
      <NotationSwitch />
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
        <span>Print</span>
      </button>
      <DownloadMenu
        onDownloadMidi={props.onDownloadMidi}
        onDownloadMp3={props.onDownloadMp3}
        exportStatus={props.exportStatus}
      />
    </div>
  );
}

import type { HandMode } from '../audio/engine';
import type { Measure, Song } from '../core';
import { MAX_TEMPO, MIN_TEMPO, usePlayer } from '../store/player';
import { cx } from './classnames';
import { LoopIcon, MetronomeIcon, PauseIcon, PlayIcon, StopIcon, VoiceIcon } from './icons';

const HAND_MODES: { mode: HandMode; label: string; hint: string }[] = [
  { mode: 'both', label: 'Both', hint: 'Both hands (1)' },
  { mode: 'right', label: 'Right', hint: 'Right hand only (2)' },
  { mode: 'left', label: 'Left', hint: 'Left hand only (3)' },
];

interface TransportBarProps {
  /** The song as performed, including any introduction. */
  song: Song;
}

/** How a measure is named in the position readout and the loop menus. */
function measureLabel(measure: Measure, long: boolean): string {
  if (measure.part === 'intro') return `Intro ${measure.index + 1}`;
  if (measure.number === null) return 'Pickup';
  return long ? `m. ${measure.number}` : `${measure.number}`;
}

/** Playback controls, fixed to the bottom of the window. */
export function TransportBar({ song }: TransportBarProps) {
  const status = usePlayer((state) => state.status);
  const error = usePlayer((state) => state.error);
  const handMode = usePlayer((state) => state.handMode);
  const tempo = usePlayer((state) => state.tempo);
  const metronome = usePlayer((state) => state.metronome);
  const voiceGuide = usePlayer((state) => state.voiceGuide);
  const loop = usePlayer((state) => state.loop);
  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const { toggle, stop, setHandMode, setTempo, toggleMetronome, toggleVoiceGuide, setLoop } =
    usePlayer.getState();

  const playing = status === 'playing';
  // The sung melody is a separate line only while the right hand accompanies.
  const hasVoice = song.measures.some((measure) => measure.voice !== undefined);
  const current = song.measures[currentMeasure];
  const lastNumber = song.measures[song.measures.length - 1]?.number;

  const loopSelect = (value: number, onChange: (index: number) => void, label: string) => (
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={label}
    >
      {song.measures.map((measure) => (
        <option key={measure.index} value={measure.index}>
          {measureLabel(measure, false)}
        </option>
      ))}
    </select>
  );

  return (
    <footer className="transport">
      {error && (
        <p className="transport__error" role="alert">
          {error}
        </p>
      )}
      <div className="transport__inner">
        <div className="transport__group">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void toggle()}
            disabled={status === 'loading'}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {status === 'loading' ? (
              <span className="spinner" aria-hidden="true" />
            ) : playing ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </button>
          <button
            type="button"
            className="button"
            onClick={stop}
            aria-label="Stop"
            title="Stop and return to the start"
          >
            <StopIcon />
          </button>
          <span className="transport__position" aria-live="off">
            {status === 'loading' ? (
              'Loading piano…'
            ) : (
              <>
                <strong>{current ? measureLabel(current, true) : ''}</strong>
                {lastNumber !== null && lastNumber !== undefined && <span> / {lastNumber}</span>}
              </>
            )}
          </span>
        </div>

        <div className="segmented" role="radiogroup" aria-label="Hands to play">
          {HAND_MODES.map(({ mode, label, hint }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={handMode === mode}
              className={cx(handMode === mode && 'is-selected', `segmented--${mode}`)}
              onClick={() => setHandMode(mode)}
              title={hint}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="tempo">
          <span>Tempo</span>
          <input
            type="range"
            min={MIN_TEMPO}
            max={MAX_TEMPO}
            value={tempo}
            onChange={(event) => setTempo(Number(event.target.value))}
            aria-label="Tempo in beats per minute"
          />
          <button
            type="button"
            className="tempo__value"
            onClick={() => setTempo(song.meta.tempo)}
            title={`Reset to the printed tempo (${song.meta.tempo})`}
          >
            {tempo}
          </button>
        </label>

        <div className="transport__group">
          {hasVoice && (
            <button
              type="button"
              className={cx('button', 'button--toggle', voiceGuide && 'is-on')}
              onClick={toggleVoiceGuide}
              aria-pressed={voiceGuide}
              title="Play the sung melody as a guide (V)"
            >
              <VoiceIcon />
              <span>Voice</span>
            </button>
          )}
          <button
            type="button"
            className={cx('button', 'button--toggle', metronome && 'is-on')}
            onClick={toggleMetronome}
            aria-pressed={metronome}
            title="Metronome with a count-in"
          >
            <MetronomeIcon />
            <span>Click</span>
          </button>
          <button
            type="button"
            className={cx('button', 'button--toggle', loop.enabled && 'is-on')}
            onClick={() => setLoop({ enabled: !loop.enabled })}
            aria-pressed={loop.enabled}
            title="Repeat a range of measures"
          >
            <LoopIcon />
            <span>Loop</span>
          </button>
          {loop.enabled && (
            <span className="loop-range">
              {loopSelect(loop.from, (from) => setLoop({ from }), 'Loop from measure')}
              <span>to</span>
              {loopSelect(loop.to, (to) => setLoop({ to }), 'Loop to measure')}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

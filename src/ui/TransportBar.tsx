import type { HandMode } from '../audio/engine';
import type { Song } from '../core';
import { MAX_TEMPO, MIN_TEMPO, usePlayer } from '../store/player';
import { cx } from './classnames';
import { LoopIcon, MetronomeIcon, PauseIcon, PlayIcon, StopIcon } from './icons';

const HAND_MODES: { mode: HandMode; label: string; hint: string }[] = [
  { mode: 'both', label: 'Both', hint: 'Both hands (1)' },
  { mode: 'right', label: 'Right', hint: 'Melody only (2)' },
  { mode: 'left', label: 'Left', hint: 'Left hand only (3)' },
];

interface TransportBarProps {
  song: Song;
}

/** Playback controls, fixed to the bottom of the window. */
export function TransportBar({ song }: TransportBarProps) {
  const status = usePlayer((state) => state.status);
  const error = usePlayer((state) => state.error);
  const handMode = usePlayer((state) => state.handMode);
  const tempo = usePlayer((state) => state.tempo);
  const metronome = usePlayer((state) => state.metronome);
  const loop = usePlayer((state) => state.loop);
  const currentMeasure = usePlayer((state) => state.currentMeasure);
  const { toggle, stop, setHandMode, setTempo, toggleMetronome, setLoop } = usePlayer.getState();

  // Measure numbers shown to the player; a pickup measure counts as 0.
  const numberOf = (index: number) => song.measures[index]?.number ?? 0;
  const indexOf = (number: number) => {
    const found = song.measures.findIndex((measure) => (measure.number ?? 0) === number);
    return found === -1 ? 0 : found;
  };
  const firstNumber = numberOf(0);
  const lastNumber = numberOf(song.measures.length - 1);
  const playing = status === 'playing';
  const position = song.measures[currentMeasure]?.number;

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
                <strong>{position === null ? 'Pickup' : `m. ${position}`}</strong>
                <span> / {lastNumber}</span>
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
              <input
                type="number"
                min={firstNumber}
                max={lastNumber}
                value={numberOf(loop.from)}
                onChange={(event) => setLoop({ from: indexOf(Number(event.target.value)) })}
                aria-label="Loop from measure"
              />
              <span>to</span>
              <input
                type="number"
                min={firstNumber}
                max={lastNumber}
                value={numberOf(loop.to)}
                onChange={(event) => setLoop({ to: indexOf(Number(event.target.value)) })}
                aria-label="Loop to measure"
              />
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

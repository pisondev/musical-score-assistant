import { useRef, useState, type KeyboardEvent } from 'react';
import type { HandMode } from '../audio/engine';
import type { Measure, Song } from '../core';
import { MAX_TEMPO, MIN_TEMPO, usePlayer } from '../store/player';
import { cx } from './classnames';
import {
  LoopIcon,
  MetronomeIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  StopIcon,
  VoiceIcon,
} from './icons';

const HAND_MODES: { mode: HandMode; label: string; hint: string }[] = [
  { mode: 'both', label: 'Both', hint: 'Both hands (1)' },
  { mode: 'right', label: 'Right', hint: 'Right hand only (2)' },
  { mode: 'left', label: 'Left', hint: 'Left hand only (3)' },
];

/** How far Shift with an arrow key moves the tempo. */
const TEMPO_LEAP = 10;

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

interface TempoFieldProps {
  tempo: number;
  onChange: (tempo: number) => void;
}

/**
 * The tempo as a number that can be typed. The value is applied on Enter or
 * when the field loses focus, so a tempo is never set halfway through typing
 * it; Escape puts the old value back, and the arrow keys step it.
 */
function TempoField({ tempo, onChange }: TempoFieldProps) {
  // The text being typed, or null while the field just shows the tempo.
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const freshFocus = useRef(false);

  const commit = () => {
    freshFocus.current = false;
    const value = Number.parseInt(draft ?? '', 10);
    if (!cancelled.current && Number.isFinite(value)) onChange(value);
    cancelled.current = false;
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      cancelled.current = true;
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const typed = Number.parseInt(draft ?? '', 10);
      const from = Number.isFinite(typed) ? typed : tempo;
      const step = (event.shiftKey ? TEMPO_LEAP : 1) * (event.key === 'ArrowUp' ? 1 : -1);
      const next = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, from + step));
      onChange(next);
      setDraft(String(next));
    }
  };

  return (
    <input
      className="tempo__value"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      autoComplete="off"
      enterKeyHint="done"
      value={draft ?? String(tempo)}
      aria-label={`Tempo in beats per minute, ${MIN_TEMPO} to ${MAX_TEMPO}`}
      title={`Type a tempo from ${MIN_TEMPO} to ${MAX_TEMPO}`}
      onFocus={(event) => {
        setDraft(String(tempo));
        // Typing replaces the number: select it all as soon as the field is entered.
        event.currentTarget.select();
        freshFocus.current = true;
      }}
      onMouseUp={(event) => {
        // The click that focused the field would otherwise place a caret and drop the selection.
        if (freshFocus.current) event.preventDefault();
        freshFocus.current = false;
      }}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
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
        <div className="transport__group transport__group--play">
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

        {/* On a phone these two share the second row; on a wide window the wrapper has no box. */}
        <div className="transport__controls">
          <div className="tempo" role="group" aria-label="Tempo">
            <span aria-hidden="true">Tempo</span>
            <input
              type="range"
              min={MIN_TEMPO}
              max={MAX_TEMPO}
              value={tempo}
              onChange={(event) => setTempo(Number(event.target.value))}
              aria-label="Tempo slider"
            />
            <TempoField tempo={tempo} onChange={setTempo} />
            <button
              type="button"
              className="tempo__reset"
              onClick={() => setTempo(song.meta.tempo)}
              disabled={tempo === song.meta.tempo}
              aria-label={`Back to the printed tempo, ${song.meta.tempo}`}
              title={`Back to the printed tempo (${song.meta.tempo})`}
            >
              <ResetIcon width={16} height={16} />
            </button>
          </div>

          <div className="transport__group transport__group--toggles">
            {hasVoice && (
              <button
                type="button"
                className={cx('button', 'button--toggle', voiceGuide && 'is-on')}
                onClick={toggleVoiceGuide}
                aria-pressed={voiceGuide}
                aria-label="Voice"
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
              aria-label="Click"
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
              aria-label="Loop"
              title="Repeat a range of measures"
            >
              <LoopIcon />
              <span>Loop</span>
            </button>
          </div>
        </div>

        {loop.enabled && (
          <div className="loop-range">
            <span>Loop</span>
            {loopSelect(loop.from, (from) => setLoop({ from }), 'Loop from measure')}
            <span>to</span>
            {loopSelect(loop.to, (to) => setLoop({ to }), 'Loop to measure')}
          </div>
        )}
      </div>
    </footer>
  );
}

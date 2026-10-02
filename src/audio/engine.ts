import type * as ToneModule from 'tone';
import { PPQ, type NoteEvent, type Track } from '../core';

type Tone = typeof ToneModule;

export type HandMode = 'both' | 'right' | 'left';

/** What plays one track: a sampled piano for the hands, a soft synthesizer for the voice. */
type Instrument = ToneModule.Sampler | ToneModule.PolySynth;

/** Everything the engine needs to play one song with one arrangement. */
export interface Score {
  events: NoteEvent[];
  totalTicks: number;
  /** Start and length of every measure, used to accent the metronome. */
  measures: { startTick: number; length: number }[];
  beatTicks: number;
  beatsPerMeasure: number;
}

export interface LoopRange {
  start: number;
  end: number;
}

/** One sample every three semitones; the sampler pitch-shifts the notes in between. */
const SAMPLE_NOTES = [
  'A1',
  'C2',
  'D#2',
  'F#2',
  'A2',
  'C3',
  'D#3',
  'F#3',
  'A3',
  'C4',
  'D#4',
  'F#4',
  'A4',
  'C5',
  'D#5',
  'F#5',
  'A5',
  'C6',
];

const SAMPLE_BASE_URL = `${import.meta.env.BASE_URL}samples/piano/`;
const TRACKS: Track[] = ['right', 'left', 'voice'];
const CHANNEL_VOLUME: Record<Track, number> = { right: 2, left: -1, voice: -19 };
const SAMPLER_RELEASE = 1.2;
/** Silence appended to a recording so the last notes can ring out, in seconds. */
const RECORDING_TAIL = 2.5;
const RECORDING_SAMPLE_RATE = 44100;
const CLICK_ACCENT = 'C6';
const CLICK_BEAT = 'G5';

function sampleFile(note: string): string {
  return `${note.replace('#', 's')}.mp3`;
}

/**
 * Plays a score with two independent piano voices, one per hand, so either
 * hand can be muted while the music keeps running. A third, flute-like voice
 * plays the sung melody as a guide when the right hand accompanies. Tone.js
 * and the samples are loaded on first use to keep the initial page light.
 */
export class PlaybackEngine {
  /** Called on the main thread when playback reaches the end of the song. */
  onEnded: (() => void) | null = null;

  private tone: Tone | null = null;
  private loading: Promise<void> | null = null;
  private buffers: ToneModule.ToneAudioBuffers | null = null;
  private instruments: Record<Track, Instrument> | null = null;
  private channels: Record<Track, ToneModule.Channel> | null = null;
  private click: ToneModule.Synth | null = null;
  private countIn: ToneModule.Synth | null = null;
  private parts: ToneModule.Part[] = [];
  private endEvent: number | null = null;
  private metronomeEvent: number | null = null;

  private score: Score | null = null;
  private handMode: HandMode = 'both';
  private voiceGuide = true;
  private quarterTempo = 80;
  private metronome = false;
  private loop: LoopRange | null = null;
  private pendingTick = 0;
  /** Audio-clock time at which the transport starts after a count-in. */
  private startsAt = 0;

  /** Downloads Tone.js and the piano samples. Safe to call more than once. */
  preload(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    const tone = await import('tone');
    const transport = tone.getTransport();
    transport.PPQ = PPQ;

    const urls = Object.fromEntries(SAMPLE_NOTES.map((note) => [note, sampleFile(note)]));
    const buffers = await new Promise<ToneModule.ToneAudioBuffers>((resolve, reject) => {
      const loaded: ToneModule.ToneAudioBuffers = new tone.ToneAudioBuffers({
        urls,
        baseUrl: SAMPLE_BASE_URL,
        onload: () => resolve(loaded),
        onerror: reject,
      });
    });

    const channels = {} as Record<Track, ToneModule.Channel>;
    const instruments = {} as Record<Track, Instrument>;
    for (const track of TRACKS) {
      ({ channel: channels[track], instrument: instruments[track] } = createInstrument(
        tone,
        buffers,
        track,
      ));
    }

    this.tone = tone;
    this.buffers = buffers;
    this.channels = channels;
    this.instruments = instruments;
    this.click = this.createClick(tone);

    transport.bpm.value = this.quarterTempo;
    transport.ticks = this.pendingTick;
    this.applyHandMode();
    this.applyLoop();
    this.rebuild();
  }

  private createClick(tone: Tone): ToneModule.Synth {
    return new tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 },
      volume: -8,
    }).toDestination();
  }

  /** Replaces the music. Playback continues from the current position. */
  setScore(score: Score): void {
    this.score = score;
    this.rebuild();
  }

  private rebuild(): void {
    const tone = this.tone;
    if (!tone || !this.instruments || !this.score) return;
    const transport = tone.getTransport();

    for (const part of this.parts) part.dispose();
    this.parts = TRACKS.map((track) => {
      const instrument = this.instruments![track];
      const events = this.score!.events.filter((event) => event.track === track).map((event) => ({
        ...event,
        time: `${event.tick}i`,
      }));
      const part = new tone.Part((time, event) => {
        instrument.triggerAttackRelease(
          tone.Frequency(event.midi, 'midi').toNote(),
          tone.Ticks(event.duration).toSeconds(),
          time,
          event.velocity,
        );
      }, events);
      part.start(0);
      return part;
    });

    if (this.endEvent !== null) transport.clear(this.endEvent);
    this.endEvent = transport.schedule((time) => {
      tone.getDraw().schedule(() => this.handleEnd(), time);
    }, `${this.score.totalTicks}i`);

    this.applyMetronome();
  }

  private handleEnd(): void {
    this.stop();
    this.onEnded?.();
  }

  /** Starts or resumes playback, with a count-in when the metronome is on. */
  async play(): Promise<void> {
    await this.preload();
    const tone = this.tone!;
    await tone.start();
    const transport = tone.getTransport();
    if (transport.state === 'started') return;

    if (this.score && transport.ticks >= this.score.totalTicks) transport.ticks = 0;

    const countInSeconds = this.metronome ? this.scheduleCountIn() : 0;
    this.startsAt = tone.now() + countInSeconds + 0.05;
    transport.start(this.startsAt);
  }

  /** Schedules the count-in clicks and returns how long they last, in seconds. */
  private scheduleCountIn(): number {
    const tone = this.tone!;
    const score = this.score;
    if (!score) return 0;

    const tick = tone.getTransport().ticks;
    const measure = score.measures.find(
      (candidate) => tick >= candidate.startTick && tick < candidate.startTick + candidate.length,
    );
    // A pickup measure is counted in with the beats that complete it.
    const fullLength = score.beatsPerMeasure * score.beatTicks;
    const remaining = measure ? measure.startTick + measure.length - tick : fullLength;
    const missingBeats = Math.round((fullLength - remaining) / score.beatTicks);
    const beats = missingBeats > 0 ? missingBeats : score.beatsPerMeasure;
    const beatSeconds = (60 / this.quarterTempo) * (score.beatTicks / PPQ);

    this.countIn?.dispose();
    this.countIn = this.createClick(tone);
    const start = tone.now() + 0.05;
    for (let beat = 0; beat < beats; beat += 1) {
      const accent = beat === 0;
      this.countIn.triggerAttackRelease(
        accent ? CLICK_ACCENT : CLICK_BEAT,
        0.03,
        start + beat * beatSeconds,
        accent ? 0.9 : 0.55,
      );
    }
    return beats * beatSeconds;
  }

  private silence(): void {
    this.countIn?.dispose();
    this.countIn = null;
    this.releaseAll();
  }

  private releaseAll(): void {
    if (this.instruments) for (const track of TRACKS) this.instruments[track].releaseAll();
  }

  pause(): void {
    if (!this.tone) return;
    const transport = this.tone.getTransport();
    if (this.tone.now() < this.startsAt) {
      // Still counting in: cancel the scheduled start and keep the position.
      const tick = transport.ticks;
      transport.stop();
      transport.ticks = tick;
    } else {
      transport.pause();
    }
    this.startsAt = 0;
    this.silence();
  }

  /** Stops and returns to the start of the song, or of the loop when one is set. */
  stop(): void {
    this.pendingTick = this.loop?.start ?? 0;
    if (!this.tone) return;
    const transport = this.tone.getTransport();
    transport.stop();
    transport.ticks = this.pendingTick;
    this.startsAt = 0;
    this.silence();
  }

  seek(tick: number): void {
    this.pendingTick = tick;
    if (!this.tone) return;
    this.tone.getTransport().ticks = tick;
    this.releaseAll();
  }

  /** Current position in ticks. */
  get tick(): number {
    return this.tone ? this.tone.getTransport().ticks : this.pendingTick;
  }

  get isPlaying(): boolean {
    return this.tone?.getTransport().state === 'started';
  }

  /** Sets the tempo in quarter notes per minute. Takes effect immediately. */
  setTempo(quarterNotesPerMinute: number): void {
    this.quarterTempo = quarterNotesPerMinute;
    if (this.tone) this.tone.getTransport().bpm.value = quarterNotesPerMinute;
  }

  setHandMode(mode: HandMode): void {
    this.handMode = mode;
    this.applyHandMode();
  }

  /** Switches the guide that plays the sung melody on or off. */
  setVoiceGuide(enabled: boolean): void {
    this.voiceGuide = enabled;
    this.applyHandMode();
  }

  private applyHandMode(): void {
    if (!this.channels) return;
    this.channels.right.mute = this.handMode === 'left';
    this.channels.left.mute = this.handMode === 'right';
    this.channels.voice.mute = !this.voiceGuide;
  }

  setMetronome(enabled: boolean): void {
    this.metronome = enabled;
    this.applyMetronome();
  }

  private applyMetronome(): void {
    const tone = this.tone;
    if (!tone || !this.click) return;
    const transport = tone.getTransport();
    if (this.metronomeEvent !== null) {
      transport.clear(this.metronomeEvent);
      this.metronomeEvent = null;
    }
    const score = this.score;
    if (!this.metronome || !score) return;

    const click = this.click;
    this.metronomeEvent = transport.scheduleRepeat(
      (time) => {
        const tick = Math.round(transport.getTicksAtTime(time));
        const accent = score.measures.some((measure) => measure.startTick === tick);
        click.triggerAttackRelease(
          accent ? CLICK_ACCENT : CLICK_BEAT,
          0.03,
          time,
          accent ? 0.9 : 0.55,
        );
      },
      `${score.beatTicks}i`,
      0,
    );
  }

  /**
   * Renders the loaded score to audio, faster than real time, with the same
   * sounds, tempo, and dynamics as live playback. Only the given tracks are
   * included; the metronome and the loop are not.
   */
  async render(tracks: Track[]): Promise<AudioBuffer> {
    await this.preload();
    const tone = this.tone!;
    const buffers = this.buffers!;
    const score = this.score;
    if (!score) throw new Error('No score is loaded.');

    const secondsPerTick = 60 / (this.quarterTempo * PPQ);
    const duration = score.totalTicks * secondsPerTick + RECORDING_TAIL;
    const rendered = await tone.Offline(
      () => {
        for (const track of tracks) {
          const { instrument } = createInstrument(tone, buffers, track);
          for (const event of score.events) {
            if (event.track !== track) continue;
            instrument.triggerAttackRelease(
              tone.Frequency(event.midi, 'midi').toNote(),
              event.duration * secondsPerTick,
              event.tick * secondsPerTick,
              event.velocity,
            );
          }
        }
      },
      duration,
      2,
      RECORDING_SAMPLE_RATE,
    );
    const audio = rendered.get();
    if (!audio) throw new Error('The recording is empty.');
    return audio;
  }

  /** Repeats the given tick range, or plays straight through when null. */
  setLoop(range: LoopRange | null): void {
    this.loop = range;
    this.applyLoop();
  }

  private applyLoop(): void {
    if (!this.tone) return;
    const transport = this.tone.getTransport();
    if (this.loop) {
      transport.setLoopPoints(`${this.loop.start}i`, `${this.loop.end}i`);
      transport.loop = true;
    } else {
      transport.loop = false;
    }
  }
}

/**
 * The instrument of one track, routed through its own channel to the output:
 * a sampled piano for a hand, and for the voice a plain, flute-like tone that
 * stands apart from the piano.
 */
function createInstrument(
  tone: Tone,
  buffers: ToneModule.ToneAudioBuffers,
  track: Track,
): { channel: ToneModule.Channel; instrument: Instrument } {
  const channel = new tone.Channel({ volume: CHANNEL_VOLUME[track] }).toDestination();
  if (track === 'voice') {
    const synth = new tone.PolySynth(tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.04, decay: 0.2, sustain: 0.75, release: 0.3 },
    }).connect(channel);
    return { channel, instrument: synth };
  }
  const sampler = new tone.Sampler({
    urls: Object.fromEntries(SAMPLE_NOTES.map((note) => [note, buffers.get(note)])),
    release: SAMPLER_RELEASE,
  }).connect(channel);
  return { channel, instrument: sampler };
}

/** The single engine instance shared by the whole app. */
export const engine = new PlaybackEngine();

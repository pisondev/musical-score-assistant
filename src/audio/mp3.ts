/** Bit rate of the encoded file, in kilobits per second. */
const BIT_RATE = 160;
/** Samples per MP3 frame; the encoder is fed one frame at a time. */
const FRAME_SIZE = 1152;
/** Frames encoded before the browser gets a chance to repaint. */
const FRAMES_PER_SLICE = 200;
/** Level the loudest sample is raised to, just below full scale. */
const TARGET_PEAK = 0.9;
/** Upper limit of the boost, so a nearly silent recording is not turned into noise. */
const MAX_GAIN = 12;

/**
 * Gain that brings the loudest sample to the target level. The piano samples
 * are recorded well below full scale; without this a file sounds faint next
 * to other music. The balance between soft and loud passages is unchanged.
 */
export function normalizationGain(peak: number): number {
  if (peak <= 0) return 1;
  return Math.min(MAX_GAIN, TARGET_PEAK / peak);
}

/** Converts floating-point samples (-1 to 1) to the 16-bit integers the encoder takes. */
export function toInt16(samples: Float32Array, gain = 1): Int16Array {
  const result = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] * gain));
    result[index] = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
  }
  return result;
}

function peakOf(channels: Float32Array[]): number {
  let peak = 0;
  for (const samples of channels) {
    for (let index = 0; index < samples.length; index += 1) {
      const level = Math.abs(samples[index]);
      if (level > peak) peak = level;
    }
  }
  return peak;
}

/**
 * Encodes rendered audio as an MP3 file. The encoder is loaded on demand and
 * works through the audio in slices, so the page stays responsive;
 * `onProgress` receives a value from 0 to 1.
 */
export async function encodeMp3(
  audio: AudioBuffer,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channelCount = Math.min(2, audio.numberOfChannels);
  const channels = Array.from({ length: channelCount }, (_, index) => audio.getChannelData(index));
  const gain = normalizationGain(peakOf(channels));
  const encoder = new Mp3Encoder(channelCount, audio.sampleRate, BIT_RATE);
  const left = toInt16(channels[0], gain);
  const right = channelCount > 1 ? toInt16(channels[1], gain) : left;

  const parts: BlobPart[] = [];
  const keep = (bytes: Uint8Array) => {
    if (bytes.length > 0) parts.push(bytes.slice().buffer);
  };

  let frames = 0;
  for (let offset = 0; offset < left.length; offset += FRAME_SIZE) {
    const leftFrame = left.subarray(offset, offset + FRAME_SIZE);
    keep(
      channelCount > 1
        ? encoder.encodeBuffer(leftFrame, right.subarray(offset, offset + FRAME_SIZE))
        : encoder.encodeBuffer(leftFrame),
    );
    frames += 1;
    if (frames % FRAMES_PER_SLICE === 0) {
      onProgress?.(offset / left.length);
      await new Promise((resolve) => setTimeout(resolve));
    }
  }
  keep(encoder.flush());
  onProgress?.(1);
  return new Blob(parts, { type: 'audio/mpeg' });
}

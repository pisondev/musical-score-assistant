import { describe, expect, it } from 'vitest';
import { estimateMp3Bytes, RECORDING_TAIL } from '../src/audio/mp3';
import { ticksToSeconds } from '../src/core/time';
import { formatBytes, formatDuration } from '../src/ui/file-size';

describe('the length of a performance', () => {
  it('follows the tempo, counted in beats of the time signature', () => {
    // Sixteen measures of three quarter notes at 60 beats per minute: 48 seconds.
    expect(ticksToSeconds(16 * 3 * 480, 60, { beats: 3, unit: 4 })).toBe(48);
    expect(ticksToSeconds(16 * 3 * 480, 120, { beats: 3, unit: 4 })).toBe(24);
    // In six-eight the beat is an eighth note: six of them at 120 last three seconds.
    expect(ticksToSeconds(6 * 240, 120, { beats: 6, unit: 8 })).toBe(3);
    expect(ticksToSeconds(0, 80, { beats: 4, unit: 4 })).toBe(0);
  });
});

describe('the size of a recording', () => {
  it('follows the constant bit rate of the encoder', () => {
    // 160 kilobits per second are 20,000 bytes per second.
    expect(estimateMp3Bytes(1)).toBe(20_000);
    expect(estimateMp3Bytes(60 + RECORDING_TAIL)).toBe(1_250_000);
    expect(estimateMp3Bytes(0)).toBe(0);
    expect(estimateMp3Bytes(-3)).toBe(0);
  });
});

describe('a file size for reading', () => {
  it('uses the unit that keeps the number short', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(3482)).toBe('3.4 KB');
    expect(formatBytes(15_360)).toBe('15 KB');
    expect(formatBytes(1_250_000)).toBe('1.2 MB');
    expect(formatBytes(24 * 1024 * 1024)).toBe('24 MB');
  });

  it('never shows a thousand or more of a unit', () => {
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024 * 1024 - 1)).toBe('1.0 MB');
  });
});

describe('a length of time for reading', () => {
  it('is minutes and seconds, with hours when there are any', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(48)).toBe('0:48');
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(185)).toBe('3:05');
    expect(formatDuration(3730)).toBe('1:02:10');
  });
});

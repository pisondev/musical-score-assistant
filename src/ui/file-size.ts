const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;

/** A file size for reading: "812 B", "3.4 KB", "1.6 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < KILOBYTE) return `${Math.max(0, Math.round(bytes))} B`;
  // One decimal while it says something; whole numbers from ten upwards.
  const scaled = (value: number) => (value < 9.95 ? value.toFixed(1) : String(Math.round(value)));
  if (bytes < MEGABYTE * 0.9995) return `${scaled(bytes / KILOBYTE)} KB`;
  return `${scaled(bytes / MEGABYTE)} MB`;
}

/** A length of time for reading: "0:48", "3:05", "1:02:10". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

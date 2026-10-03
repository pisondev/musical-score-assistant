/**
 * The URL of a request, read from its target (`/path?query`). The target is put after a fixed
 * origin instead of being resolved against it, so that a path such as `//` or
 * `//example.test/x` stays a path rather than naming another host, or failing to parse. Null
 * for a target that is not a path, such as the absolute form a proxy would send.
 */
export function requestUrl(target: string | undefined): URL | null {
  const path = target ?? '/';
  if (!path.startsWith('/')) return null;
  try {
    return new URL(`http://localhost${path}`);
  } catch {
    return null;
  }
}

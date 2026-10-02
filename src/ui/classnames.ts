/** Joins class names, skipping values that are false, null, or undefined. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

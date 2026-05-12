/**
 * Returns true if `current` is strictly below `minimum`.
 * Both strings must be in "major.minor.patch" semver format.
 */
export function isVersionBelow(current: string, minimum: string): boolean {
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) > (b[i] ?? 0)) return false;
  }
  return false; // equal
}

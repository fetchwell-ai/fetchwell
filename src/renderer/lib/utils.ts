import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns true if the given string is a well-formed URL with an http or https
 * protocol and a valid hostname. Does not check reachability.
 */
export function validatePortalUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

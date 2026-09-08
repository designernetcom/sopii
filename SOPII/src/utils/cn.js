/** Tiny conditional-className joiner. Keeps JSX readable without a dependency. */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

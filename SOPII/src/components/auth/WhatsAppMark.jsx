/**
 * WhatsApp's glyph, inline.
 *
 * Inlined rather than fetched for the same reason Google's is: a login screen
 * must not depend on a third-party asset loading, and an icon font recoloured
 * to approximate a brand mark is worse than the mark itself.
 *
 * `tone` exists because this appears on two backgrounds — on the cream page it
 * needs WhatsApp's green, and inside the filled button it has to be the button
 * text colour or it disappears into the fill.
 */
export function WhatsAppMark({ size = 18, tone = 'brand', className, ...rest }) {
  const fill = tone === 'brand' ? '#25D366' : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path
        fill={fill}
        d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"
      />
      <path
        fill={fill}
        d="M12.04 2h-.01C6.5 2 2 6.5 2 12.04c0 1.77.46 3.5 1.34 5.02L2 22l5.06-1.32a10 10 0 0 0 4.98 1.31h.01C17.58 21.99 22 17.49 22 11.95 22 6.41 17.58 2 12.04 2zm0 18.17h-.01a8.3 8.3 0 0 1-4.23-1.16l-.3-.18-3.14.82.84-3.06-.2-.32a8.28 8.28 0 0 1-1.27-4.43c0-4.59 3.73-8.32 8.32-8.32 2.22 0 4.31.87 5.88 2.44a8.27 8.27 0 0 1 2.44 5.89c0 4.59-3.73 8.32-8.33 8.32z"
      />
    </svg>
  );
}

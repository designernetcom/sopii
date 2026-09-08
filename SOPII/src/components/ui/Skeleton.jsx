import { cn } from '../../utils/cn';

/**
 * Shimmer placeholders (§ loading states).
 * ===========================================================================
 * Every wait in the shop is drawn as the *shape* of the thing that is about to
 * arrive rather than as a spinner. A spinner says "wait"; a skeleton says
 * "the price goes here", and it reserves the space so nothing jumps when the
 * data lands — which is the half of the problem a spinner never solved.
 *
 * The sweep itself is one CSS utility, `.skeleton` in index.css, so it is
 * identical everywhere and the `prefers-reduced-motion` rule at the top of
 * that file switches all of it off without any component knowing about it.
 */

/**
 * A single shimmering block. Size it with the same utility classes you would
 * put on the element it stands in for.
 *
 * @param {boolean} [dark] Sweep tuned for a dark photograph or panel, where
 *   the default sand block would glare.
 */
export function Skeleton({ className, dark = false, ...rest }) {
  return (
    <span
      aria-hidden="true"
      className={cn('skeleton block', dark && 'skeleton-dark', className)}
      {...rest}
    />
  );
}

/**
 * Ragged line widths. Bars of one width read as a barcode; these read as a
 * paragraph, which is what is actually on its way.
 */
const LINE_WIDTHS = ['w-full', 'w-[93%]', 'w-[97%]', 'w-[85%]'];

/** A block of body copy. The last line is always short, as real text is. */
export function SkeletonText({ lines = 3, className, lineClassName, dark = false }) {
  return (
    <div className={cn('space-y-2.5', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          dark={dark}
          className={cn(
            'h-2.5',
            i === lines - 1 && lines > 1 ? 'w-2/3' : LINE_WIDTHS[i % LINE_WIDTHS.length],
            lineClassName,
          )}
        />
      ))}
    </div>
  );
}

/**
 * Wraps a screenful of skeletons.
 *
 * The blocks themselves are `aria-hidden` — a screen reader has no use for
 * forty grey rectangles. This announces the wait once, in words, and marks the
 * region busy so assistive tech knows the content is not final.
 */
export function SkeletonScreen({ label = 'Loading', className, children, ...rest }) {
  return (
    <div role="status" aria-busy="true" className={className} {...rest}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

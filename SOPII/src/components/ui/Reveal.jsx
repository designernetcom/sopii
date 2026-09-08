import { cn } from '../../utils/cn';
import { useReveal } from '../../hooks/useReveal';

/**
 * Fades and lifts children into view once, on scroll.
 * `delay` staggers siblings without needing per-item CSS.
 */
export function Reveal({ children, className, delay = 0, as: Tag = 'div' }) {
  const [ref, visible] = useReveal();

  return (
    <Tag
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-silk motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        className,
      )}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Tag>
  );
}

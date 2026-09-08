import { cn } from '../../utils/cn';

export function Spinner({ size = 18, className }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size, borderWidth: Math.max(1.5, size / 12) }}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent align-[-2px]',
        className,
      )}
    />
  );
}

/** Full-page fallback for lazily loaded routes. */
export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
      <Spinner size={26} className="text-clay" />
    </div>
  );
}

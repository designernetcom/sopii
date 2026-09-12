import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

/** Shared empty state for wishlist, cart, search and order history. */
export function EmptyState({ icon: Icon, title, text, action, secondaryAction, className }) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-16 text-center sm:py-24', className)}>
      {Icon ? (
        <span className="mb-6 grid h-16 w-16 place-items-center rounded-full border border-beige bg-cream">
          <Icon size={24} className="text-brand-soft" aria-hidden="true" strokeWidth={1.25} />
        </span>
      ) : null}

      <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
      {text ? <p className="mt-3 max-w-sm text-sm text-charcoal-muted">{text}</p> : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Action action={action} className="btn-primary" />
        <Action action={secondaryAction} className="btn-outline" />
      </div>
    </div>
  );
}

/** Renders a Link for `to` actions and a button for `onClick` ones. */
function Action({ action, className }) {
  if (!action) return null;

  if (action.onClick) {
    return (
      <button type="button" onClick={action.onClick} className={className}>
        {action.label}
      </button>
    );
  }

  return (
    <Link to={action.to} className={className}>
      {action.label}
    </Link>
  );
}

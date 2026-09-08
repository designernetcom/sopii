import { useState } from 'react';
import { cn } from '../../utils/cn';
import { useToast } from '../../context/ToastContext';
import { ApiError, subscribeToNewsletter } from '../../services/api';

/**
 * Newsletter signup.
 *
 * ---------------------------------------------------------------------------
 * NOTE: THIS COMPONENT CURRENTLY RENDERS NOTHING.
 *
 * The entire body below is commented out, so it draws an empty `<section>` —
 * which means the footer's newsletter panel is absent from the live shop and
 * `/api/storefront/newsletter` is never called from here. That is somebody's
 * deliberate switch-off rather than a bug, so it has been left alone; but it
 * is not obvious from the outside, and it is worth an explicit decision to
 * either restore it or remove the component and its call sites.
 *
 * `ArrowRight`, `Check` and `Spinner` were imported for that commented markup
 * and have been removed — they were shipping in the bundle for nothing.
 * Restoring the block needs them back.
 * ---------------------------------------------------------------------------
 *
 * The address is posted to `/api/storefront/newsletter`, which records it
 * against a customer marked as accepting marketing — so a subscriber shows up
 * in the admin panel rather than vanishing into a success state.
 *
 * `tone="dark"` is the footer's deep-plum panel; the default sits on the
 * light page background.
 */
export function Newsletter({ tone = 'light' }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [message, setMessage] = useState('');
  const { toast } = useToast();

  const dark = tone === 'dark';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (state === 'loading') return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setState('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setState('loading');
    setMessage('');

    try {
      const result = await subscribeToNewsletter(email);
      setState('done');
      setMessage(result?.message || 'You are on the list. Look out for our next drop.');
      toast('Welcome to the SOPII world');
      setEmail('');
    } catch (error) {
      setState('error');
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'We could not sign you up just now. Please try again in a moment.',
      );
    }
  };

  /* Read only by the commented-out markup below; see the note on the
     component. Placed after `handleSubmit` so the reference is live. */
  void message;
  void handleSubmit;

  return (
    <section
      className={cn(dark ? 'bg-transparent' : 'bg-sand/60')}
      aria-labelledby="newsletter-heading"
    >
      {/* <div className={cn('container-site', dark ? 'py-14 lg:py-[4.5rem]' : 'py-14 lg:py-20')}>
        <div className="mx-auto max-w-xl text-center">
          <p className={dark ? 'footer-eyebrow' : 'eyebrow'}>Newsletter</p>

          <h2
            id="newsletter-heading"
            className={cn(
              'mt-3 font-display text-3xl sm:text-4xl',
              dark && 'text-cream lg:text-[42px]',
            )}
          >
            Join the SOPII World
          </h2>

          
          {dark ? (
            <span
              aria-hidden="true"
              className="mx-auto mt-5 block h-px w-16 bg-gradient-to-r from-transparent via-gold to-transparent"
            />
          ) : null}

          <p
            className={cn(
              'mt-3 text-sm sm:text-base',
              dark ? 'mt-5 text-plum-pale/70' : 'text-charcoal-muted',
            )}
          >
            Be the first to discover new collections, exclusive offers and stories from the
            looms we work with.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state !== 'idle') {
                    setState('idle');
                    setMessage('');
                  }
                }}
                placeholder="Enter your email"
                autoComplete="email"
                aria-invalid={state === 'error'}
                aria-describedby={message ? 'newsletter-message' : undefined}
                className={cn(dark ? 'field-dark' : 'field', 'flex-1 text-center sm:text-left')}
              />
              <button
                type="submit"
                disabled={state === 'loading'}
                className={cn(dark ? 'btn-gold' : 'btn-primary', 'group sm:px-8')}
              >
                {state === 'loading' ? (
                  <>
                    <Spinner size={13} /> Subscribing
                  </>
                ) : state === 'done' ? (
                  <>
                    <Check size={14} aria-hidden="true" /> Subscribed
                  </>
                ) : (
                  <>
                    Subscribe
                    <ArrowRight
                      size={14}
                      aria-hidden="true"
                      className="transition-transform duration-300 ease-silk group-hover:translate-x-1"
                    />
                  </>
                )}
              </button>
            </div>

            {message ? (
              <p
                id="newsletter-message"
                role={state === 'error' ? 'alert' : 'status'}
                className={cn(
                  'mt-3 text-[12px]',
                  state === 'error'
                    ? dark
                      ? 'text-sale-soft'
                      : 'text-sale'
                    : dark
                      ? 'text-gold-soft'
                      : 'text-clay',
                )}
              >
                {message}
              </p>
            ) : null}
          </form>

          <p
            className={cn(
              'mt-4 text-[11px]',
              dark ? 'text-plum-pale/60' : 'text-charcoal-faint',
            )}
          >
            No spam. Unsubscribe whenever you like.
          </p>
        </div>
      </div> */}
    </section>
  );
}

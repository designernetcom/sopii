import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Price } from './Price';
import { Badge } from './Badge';

/*
 * The two primitives that render on every product card.
 * ===========================================================================
 * These were each re-implemented per component before the consolidation, with
 * the copies drifting on exactly the details asserted here — whether the MRP
 * is struck through, whether a "0% off" flag appears on a full-price product,
 * and which colour pairing a badge uses.
 *
 * The assertions are about what a shopper sees, not about class strings,
 * except where a class *is* the behaviour: `line-through` on the MRP is the
 * only thing distinguishing the old price from the new one.
 */

describe('Price', () => {
  it('shows the current price', () => {
    render(<Price price={3990} />);
    expect(screen.getByText(/3,990/)).toBeInTheDocument();
  });

  it('shows the MRP struck through, and the saving, when there is a discount', () => {
    render(<Price price={3990} originalPrice={4990} discount={20} />);

    expect(screen.getByText(/3,990/)).toBeInTheDocument();
    expect(screen.getByText(/4,990/)).toHaveClass('line-through');
    expect(screen.getByText(/20% off/i)).toBeInTheDocument();
  });

  it('shows nothing but the price when there is no discount', () => {
    // A "0% off" flag on a full-price product is noise that reads as a bug.
    render(<Price price={4990} originalPrice={4990} discount={0} />);

    expect(screen.queryByText(/off/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/line-through/)).not.toBeInTheDocument();
  });

  it('shows no saving when the MRP is below the price', () => {
    // Bad data must not render "-25% off".
    render(<Price price={4990} originalPrice={3990} discount={-25} />);
    expect(screen.queryByText(/off/i)).not.toBeInTheDocument();
  });

  it('renders at every size without dropping the price', () => {
    for (const size of ['sm', 'md', 'lg']) {
      const { unmount } = render(<Price price={1500} size={size} />);
      expect(screen.getByText(/1,500/)).toBeInTheDocument();
      unmount();
    }
  });

  it('keeps a caller’s className alongside its own layout classes', () => {
    const { container } = render(<Price price={100} className="mt-4" />);

    expect(container.firstChild).toHaveClass('mt-4');
    expect(container.firstChild).toHaveClass('flex');
  });
});

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('takes its tone from the label when no tone is given', () => {
    render(<Badge>Bestseller</Badge>);

    // Charcoal on gold, not cream on gold: cream measures 2.23:1 against the
    // brand gold and is unreadable; charcoal on the same gold is 6.91:1.
    const badge = screen.getByText('Bestseller');
    expect(badge).toHaveClass('bg-gold');
    expect(badge).toHaveClass('text-charcoal');
  });

  it('lets an explicit tone win over the label', () => {
    render(<Badge tone="Sale">Limited</Badge>);
    expect(screen.getByText('Limited')).toHaveClass('bg-sale');
  });

  it('falls back to the soft tone for a label it does not know', () => {
    render(<Badge>Handloom</Badge>);
    const badge = screen.getByText('Handloom');

    expect(badge).toHaveClass('bg-cream/95');
    expect(badge).toHaveClass('border');
  });

  it('is uppercase and tracked, so it reads as a flag rather than as text', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toHaveClass('uppercase');
  });
});

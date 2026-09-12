import { RefreshCw, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { cn } from '../../utils/cn';
import { TRUST_ITEMS } from '../../data/site';
import { Reveal } from '../ui/Reveal';

const ICONS = { Truck, RefreshCw, ShieldCheck, Sparkles };

/** Four reassurance points. `bordered` adds the top rule used on the home page. */
export function TrustSection({ bordered = true, className }) {
  return (
    <section
      aria-labelledby="trust-heading"
      className={cn(bordered && 'border-t border-beige', className)}
    >
      <div className="container-site py-12 lg:py-16">
        {/* The section's <h2>. The four points are <h3>s, so without it the
            heading outline skipped a level wherever this block appears. */}
        <h2 id="trust-heading" className="sr-only">
          Why shop with SOPII
        </h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-9 lg:grid-cols-4 lg:gap-8">
          {TRUST_ITEMS.map((item, i) => {
            const Icon = ICONS[item.icon] || Sparkles;
            return (
              <li key={item.title}>
                <Reveal delay={i * 70} className="flex flex-col items-center text-center lg:flex-row lg:gap-4 lg:text-left">
                  <span className="mb-3 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-beige lg:mb-0">
                    <Icon size={18} className="text-brand-soft" strokeWidth={1.4} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[11px] font-medium uppercase tracking-widest2 text-charcoal">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[12px] leading-snug text-charcoal-muted">{item.text}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

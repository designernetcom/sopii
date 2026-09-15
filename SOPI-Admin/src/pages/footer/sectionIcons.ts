import {
  Building2,
  Copyright,
  CreditCard,
  Link2,
  PanelBottom,
  Scale,
  Share2,
  Store,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { FooterSectionType } from '@/types';

/** The panel's glyph for each kind of footer section. */
export const SECTION_ICONS: Record<FooterSectionType, LucideIcon> = {
  brand: Store,
  links: Link2,
  text: Type,
  social: Share2,
  utility: PanelBottom,
  copyright: Copyright,
  payments: CreditCard,
  legal: Scale,
  credit: Building2,
};

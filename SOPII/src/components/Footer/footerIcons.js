import {
  Briefcase,
  Facebook,
  Gift,
  Globe,
  Heart,
  HelpCircle,
  Instagram,
  LifeBuoy,
  Linkedin,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Ruler,
  Scissors,
  ShieldCheck,
  Star,
  Store,
  Truck,
  Twitter,
  Youtube,
} from 'lucide-react';

/*
 * The icon names the admin panel's Footer screen may store, mapped to
 * components. The panel and API share the list in SOPI-Admin's
 * `src/data/footer.ts` and refuse any other name; keep this map in step with
 * it. Static imports on purpose — a dynamic lookup into lucide would pull the
 * whole icon set into the bundle.
 */

/** Quick links in the bottom bar. */
export const UTILITY_ICONS = {
  Package,
  LifeBuoy,
  Truck,
  RefreshCw,
  Ruler,
  HelpCircle,
  Phone,
  Mail,
  MapPin,
  Store,
  Gift,
  Heart,
  Star,
  ShieldCheck,
  Scissors,
  Briefcase,
};

/** Social platforms. `Globe` is the panel's "other / website" choice and the fallback. */
export const SOCIAL_ICONS = { Instagram, Facebook, Youtube, Twitter, Linkedin, Globe };

export const socialIcon = (name) => SOCIAL_ICONS[name] || Globe;

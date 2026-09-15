import type { FeaturedCollectionSection } from '@/types';

/*
 * The Featured Collection section's starting copy — what the shop front used
 * to hard-code, so a store that has never saved this section looks exactly as
 * it did before it became editable.
 *
 * In a file of its own, with nothing but a type import, because the API reads
 * it at runtime as the stand-in for a document that does not exist yet. The
 * rest of `data/` generates a whole demo catalogue on import, and none of that
 * belongs in a request handler.
 */
export const featuredCollectionDefaults: FeaturedCollectionSection = {
  enabled: true,
  eyebrow: 'SOPII Signature',
  heading: 'Timeless silhouettes.\nContemporary craftsmanship.',
  description:
    'Our Signature pieces are the ones we refine season after season rather than replace. ' +
    'Each begins on a loom with a weaver we know by name, and ends in a cut designed for ' +
    'how women actually move through an Indian day.',
  image:
    'https://res.cloudinary.com/w2brnx9l/image/upload/v1789307325/sopii/banners/ban_0002/yy3olw4ut5n3wmxiwazb.jpg',
  /* Empty on purpose: this photograph is filed under a banner's folder, so the
     section does not own it and must never be the one to delete it. */
  imagePublicId: '',
  imageAlt: 'A model wearing a piece from the SOPII Signature collection',
  pillars: [
    {
      id: 'pil_0001',
      title: 'Woven by hand',
      text: 'Eleven weaving clusters across five states.',
      enabled: true,
    },
    {
      id: 'pil_0002',
      title: 'Natural fibres',
      text: 'Cotton, silk and linen. Nothing synthetic.',
      enabled: true,
    },
    {
      id: 'pil_0003',
      title: 'Made to last',
      text: 'Cut and finished to survive a decade of wear.',
      enabled: true,
    },
  ],
  ctaEnabled: true,
  ctaText: 'Explore Signature',
  ctaLink: '/collections/sopii-signature',
};

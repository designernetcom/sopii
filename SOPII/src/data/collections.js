/**
 * Editorial collections. Each one maps to a filter over the catalogue, so a
 * collection page never needs its own product list — see `resolveCollection`
 * in `utils/catalog.js`.
 */

export const COLLECTIONS = [
  {
    slug: 'festive-edit',
    name: 'The Festive Edit',
    eyebrow: 'Collection 01',
    headline: 'Designed for celebrations,\ncrafted for memories.',
    blurb:
      'Silks, brocades and hand-set zari for the weeks of the year when the whole family is in one room. Pieces made to be photographed, and then worn again.',
    seed: 201,
    tags: 'silk',
    filter: { occasion: 'Festive' },
  },
  {
    slug: 'handloom-edit',
    name: 'The Handloom Edit',
    eyebrow: 'Collection 02',
    headline: 'Woven slowly.\nWorn forever.',
    blurb:
      'Every piece here left a pit loom rather than a power loom. Small irregularities are part of the weave, not a fault in it.',
    seed: 202,
    tags: 'textile',
    filter: { fabric: ['Handloom', 'Khadi', 'Chanderi'] },
  },
  {
    slug: 'everyday-cotton',
    name: 'Everyday Cotton',
    eyebrow: 'Collection 03',
    headline: 'The pieces you reach for\nwithout thinking.',
    blurb:
      'Breathable mulmul, hand-blocked cotton and easy shapes for school runs, long commutes and Indian summers.',
    seed: 203,
    tags: 'cotton',
    filter: { fabric: ['Cotton'], occasion: 'Everyday' },
  },
  {
    slug: 'wedding-wardrobe',
    name: 'The Wedding Wardrobe',
    eyebrow: 'Collection 04',
    headline: 'For the whole week,\nnot just the one night.',
    blurb:
      'Mehendi through to reception. Weighted silks for the ceremony, lighter drapes for everything in between.',
    seed: 204,
    tags: 'wedding',
    filter: { occasion: 'Wedding' },
  },
  {
    slug: 'sopii-signature',
    name: 'SOPII Signature',
    eyebrow: 'Collection 05',
    headline: 'Timeless silhouettes.\nContemporary craftsmanship.',
    blurb:
      'The handful of pieces that define the house — refined season after season and never discontinued.',
    seed: 205,
    tags: 'fashion',
    filter: { badge: 'Bestseller' },
  },
  {
    slug: 'summer-escape',
    name: 'Summer Escape',
    eyebrow: 'Collection 06',
    headline: 'Packs light.\nWears lighter.',
    blurb:
      'Kaftans, co-ords and mulmul drapes that fold into a carry-on and come out looking better for it.',
    seed: 206,
    tags: 'summer',
    filter: { occasion: 'Vacation' },
  },
];

/*
 * `resolveCollection` moved to `utils/catalog.js`: admin collections curate an
 * explicit product list while these bundled ones declare a filter, and that
 * helper now understands both. The collections below are the offline fallback
 * for when the API is unreachable — see `context/CatalogContext.jsx`.
 */

/** Full-bleed editorial banners dropped between home page sections. */
export const HOME_BANNERS = [
  {
    id: 'banner-festive',
    eyebrow: 'The Festive Edit',
    title: 'Designed for celebrations,\ncrafted for memories.',
    text: 'Handwoven silks and hand-set zari, in a palette built for lamplight.',
    cta: 'Explore Collection',
    to: '/collections/festive-edit',
    seed: 211,
    tags: 'silk',
    align: 'left',
    image:
      'https://sopiistore.com/cdn/shop/files/saree_9656048d-67a5-4c6b-93b9-5fe16f6ef69d.jpg?format=webp&v=1752903494&width=1600',
  },
  {
    id: 'banner-handloom',
    eyebrow: 'Made By Hand',
    title: 'Nine weeks on a loom\nin a village of forty weavers.',
    text: 'We work directly with eleven weaving clusters across five states.',
    cta: 'Our Craft',
    to: '/pages/our-craft',
    seed: 212,
    tags: 'textile',
    align: 'right',
    image:
      'https://sopiistore.com/cdn/shop/files/Women_Kurta_48b4326a-29bd-46bb-b479-1782742c8203.jpg?format=webp&v=1752903557&width=1600',
  },
];

/**
 * The home page's Featured Collection section, for the offline fallback only.
 * A live store's copy comes from the panel (Homepage → Featured Collection);
 * this is in the API's public shape so it goes through the same adapter.
 */
export const FEATURED_COLLECTION = {
  enabled: true,
  eyebrow: 'SOPII Signature',
  heading: 'Timeless silhouettes.\nContemporary craftsmanship.',
  description:
    'Our Signature pieces are the ones we refine season after season rather than replace. Each begins on a loom with a weaver we know by name, and ends in a cut designed for how women actually move through an Indian day.',
  image:
    'https://res.cloudinary.com/w2brnx9l/image/upload/v1789307325/sopii/banners/ban_0002/yy3olw4ut5n3wmxiwazb.jpg',
  imageAlt: 'A model wearing a piece from the SOPII Signature collection',
  pillars: [
    { id: 'pil_0001', title: 'Woven by hand', text: 'Eleven weaving clusters across five states.' },
    { id: 'pil_0002', title: 'Natural fibres', text: 'Cotton, silk and linen. Nothing synthetic.' },
    { id: 'pil_0003', title: 'Made to last', text: 'Cut and finished to survive a decade of wear.' },
  ],
  cta: { text: 'Explore Signature', link: '/collections/sopii-signature' },
};

/** Hero carousel slides. */
export const HERO_SLIDES = [
  {
    id: 'hero-1',
    eyebrow: 'New Season',
    title: 'The Art of\nEveryday Elegance',
    text: 'Discover contemporary Indian fashion designed for every occasion.',
    cta: 'Shop New Arrivals',
    to: '/new-arrivals',
    seed: 101,
    tags: 'saree',
    image:
      'https://sopiistore.com/cdn/shop/files/saree_9656048d-67a5-4c6b-93b9-5fe16f6ef69d.jpg?format=webp&v=1752903494&width=1800',
  },
  {
    id: 'hero-2',
    eyebrow: 'The Festive Edit',
    title: 'Woven for\nthe Long Evening',
    text: 'Silks, brocades and hand-set zari, ready for the season of celebrations.',
    cta: 'Explore the Edit',
    to: '/collections/festive-edit',
    seed: 102,
    tags: 'silk',
    image:
      'https://sopiistore.com/cdn/shop/files/Blouse_246f00ce-a14f-48bc-ab1f-97bd4f2bd429.jpg?format=webp&v=1752903535&width=1800',
  },
  {
    id: 'hero-3',
    eyebrow: 'Everyday Cotton',
    title: 'Lightness,\nBy Design',
    text: 'Breathable mulmul and hand-blocked cotton for an Indian summer.',
    cta: 'Shop Cotton',
    to: '/collections/everyday-cotton',
    seed: 103,
    tags: 'cotton',
    image:
      'https://sopiistore.com/cdn/shop/files/Women_Kurta_48b4326a-29bd-46bb-b479-1782742c8203.jpg?format=webp&v=1752903557&width=1800',
  },
];

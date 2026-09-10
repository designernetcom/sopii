import { productImage } from '../utils/images';
import { slugify } from '../utils/format';
import { COLOR_SWATCHES } from './categories';

/**
 * SOPII mock catalogue — 70 products across seven categories.
 * ---------------------------------------------------------------------------
 * Each entry below is a compact tuple; `build()` expands it into the full
 * product shape consumed by ProductCard, the shop filters and the PDP.
 *
 *   [ name, price, mrp, rating, reviews, badge, fabric, colors,
 *     occasions, description ]
 *
 * Imagery comes from productImage() in src/utils/images.js — flip
 * USE_REMOTE_PHOTOS there to swap in real photography.
 */

const CATEGORY_META = {
  Sarees: { prefix: 'sar', tag: 'saree', sizes: ['Free Size'], seedBase: 1000 },
  Blouses: { prefix: 'blo', tag: 'blouse', sizes: ['XS', 'S', 'M', 'L', 'XL'], seedBase: 2000 },
  Dresses: { prefix: 'drs', tag: 'dress', sizes: ['XS', 'S', 'M', 'L', 'XL'], seedBase: 3000 },
  'Kurta Sets': { prefix: 'kur', tag: 'kurta', sizes: ['S', 'M', 'L', 'XL', 'XXL'], seedBase: 4000 },
  'Co-ords': { prefix: 'cor', tag: 'fashion', sizes: ['XS', 'S', 'M', 'L', 'XL'], seedBase: 5000 },
  Jewellery: { prefix: 'jwl', tag: 'jewellery', sizes: ['One Size'], seedBase: 6000 },
  Accessories: { prefix: 'acc', tag: 'handbag', sizes: ['One Size'], seedBase: 7000 },
};

/** Fabric-specific care copy shown on the product detail page. */
const CARE_BY_FABRIC = {
  Cotton: ['Hand wash separately in cold water', 'Do not bleach', 'Warm iron on reverse', 'Dry in shade'],
  Silk: ['Dry clean only', 'Store wrapped in muslin', 'Do not spray perfume directly', 'Iron on low with a cloth'],
  Linen: ['Gentle machine wash, cold', 'Do not tumble dry', 'Steam or warm iron while damp', 'Dry flat in shade'],
  Handloom: ['First wash dry clean', 'Subsequent gentle hand wash', 'Do not wring', 'Dry in shade'],
  Chanderi: ['Dry clean recommended', 'Handle zari with care', 'Low iron with a muslin cloth', 'Store folded, refold seasonally'],
  Georgette: ['Hand wash cold or dry clean', 'Do not wring or twist', 'Low iron', 'Dry in shade'],
  Organza: ['Dry clean only', 'Store hanging to hold shape', 'Do not iron directly', 'Keep away from sharp jewellery'],
  Khadi: ['Hand wash in cold water', 'Expect gentle shrinkage on first wash', 'Warm iron', 'Dry in shade'],
  Tussar: ['Dry clean only', 'Avoid direct sunlight', 'Iron on reverse, low heat', 'Store in a cotton bag'],
  Brocade: ['Dry clean only', 'Do not fold on the zari', 'Steam rather than iron', 'Store in muslin'],
  Rayon: ['Gentle machine wash, cold', 'Do not bleach', 'Medium iron', 'Dry in shade'],
  Metal: ['Wipe with a soft dry cloth', 'Keep away from water and perfume', 'Store in the pouch provided', 'Avoid abrasive cleaners'],
  Leather: ['Wipe with a dry cloth', 'Condition occasionally', 'Keep away from prolonged damp', 'Store flat'],
  Jute: ['Spot clean only', 'Do not soak', 'Air out regularly', 'Store stuffed to hold shape'],
};

/* ============================ SAREES (20) ================================ */
const SAREES = [
  ['Aarohi Handwoven Cotton Saree', 3990, 4990, 4.8, 124, 'Bestseller', 'Handloom', ['Ivory', 'Indigo', 'Terracotta'], ['Everyday', 'Office Wear'],
    'A featherweight handloom cotton saree woven on pit looms in Bhuj, finished with a fine contrast selvedge. It softens with every wash and drapes without a single pleat out of place.'],
  

];

/* ============================ BLOUSES (10) =============================== */
const BLOUSES = [
  ['Ira Puff Sleeve Blouse', 1490, 1990, 4.7, 156, 'Bestseller', 'Cotton', ['Ivory', 'Black', 'Terracotta'], ['Everyday', 'Festive'],
    'A structured cotton blouse with a gathered puff sleeve that stands up on its own. Lined, boned at the seams and cut to sit flush at the waist.'],
 
];

/* ============================ DRESSES (10) =============================== */
const DRESSES = [
  ['Amara Tiered Midi Dress', 3490, 4490, 4.7, 164, 'Bestseller', 'Cotton', ['Ivory', 'Indigo', 'Terracotta'], ['Everyday', 'Vacation'],
    'Three gathered tiers of hand-blocked cotton with deep side pockets. Falls just below the calf and only gets better crumpled.'],
 
];

/* =========================== KURTA SETS (6) ============================== */
const KURTA_SETS = [
  ['Saanvi Cotton Kurta Set', 3490, 4490, 4.7, 176, 'Bestseller', 'Cotton', ['Ivory', 'Indigo', 'Mustard'], ['Everyday', 'Office Wear'],
    'A straight-cut kurta with side slits, matched palazzo and a mulmul dupatta. Hand-blocked in a small repeat that reads as solid from a distance.'],
  
];

/* ============================= CO-ORDS (4) =============================== */
const COORDS = [
  ['Ahilya Linen Co-ord Set', 5490, 6990, 4.6, 84, 'New', 'Linen', ['Beige', 'Olive', 'Off White'], ['Office Wear', 'Vacation'],
    'A relaxed linen shirt and wide-leg trouser cut to be worn together or entirely apart. Half-lined trousers, so nothing clings.'],
 
 
];

/* =========================== JEWELLERY (10) ============================== */
const JEWELLERY = [
  ['Chandni Oxidised Jhumkas', 1290, 1690, 4.8, 243, 'Bestseller', 'Metal', ['Silver'], ['Festive', 'Everyday'],
    'Hand-finished oxidised brass jhumkas with a fine ghungroo fringe. Light enough on the ear to forget you have them on.'],
 
];

/* ========================== ACCESSORIES (10) ============================= */
const ACCESSORIES = [
  ['Anvi Woven Jute Tote', 2290, 2990, 4.6, 118, 'Bestseller', 'Jute', ['Beige', 'Indigo'], ['Everyday', 'Vacation'],
    'A generously sized handwoven jute tote with a cotton lining and an inner zip pocket. Holds a laptop, a water bottle and a folded saree.'],
 
];

/* ========================== BUILD & EXPORT =============================== */

const GROUPS = [
  ['Sarees', SAREES],
  ['Blouses', BLOUSES],
  ['Dresses', DRESSES],
  ['Kurta Sets', KURTA_SETS],
  ['Co-ords', COORDS],
  ['Jewellery', JEWELLERY],
  ['Accessories', ACCESSORIES],
];

const DAY = 86400000;
const CATALOGUE_EPOCH = Date.UTC(2026, 7, 15);

function build([category, rows]) {
  const meta = CATEGORY_META[category];

  return rows.map((row, index) => {
    const [name, price, originalPrice, rating, reviews, badge, fabric, colorNames, occasions, description] = row;

    const seed = meta.seedBase + index * 7;
    const colors = colorNames.map((n) => ({ name: n, hex: COLOR_SWATCHES[n] || '#DDD6CA' }));

    /* One image per colourway, then extra angles cycling back through them, so
       every product has a five-shot gallery that reflects its real palette. */
    const images = Array.from({ length: 5 }, (_, i) =>
      productImage({
        seed: seed + i,
        color: colors[i % colors.length].hex,
        fabric,
        label: colors[i % colors.length].name,
        w: 900,
        h: 1125,
      }),
    );

    return {
      id: `${meta.prefix}-${String(index + 1).padStart(2, '0')}`,
      name,
      slug: slugify(name),
      category,
      categorySlug: slugify(category),
      fabric,
      description,
      price,
      originalPrice,
      discount: Math.round(((originalPrice - price) / originalPrice) * 100),
      rating,
      reviews,
      badge,
      sizes: meta.sizes,
      colors,
      occasions,
      images,
      image: images[0],
      hoverImage: images[1],
      /* A couple of products per category are out of stock so the availability
         filter and the disabled Add-to-Cart state are both exercisable. */
      inStock: index % 9 !== 4,
      createdAt: new Date(CATALOGUE_EPOCH - (index * 5 + meta.seedBase / 200) * DAY).toISOString(),
      popularity: reviews * rating,
      details: [
        `${fabric} · ${category.replace(/s$/, '')}`,
        `Available in ${colorNames.length} ${colorNames.length === 1 ? 'colour' : 'colours'}`,
        occasions.length ? `Styled for ${occasions.join(' & ').toLowerCase()}` : 'An everyday piece',
        'Handcrafted in India',
      ],
      care: CARE_BY_FABRIC[fabric] || CARE_BY_FABRIC.Cotton,
    };
  });
}

export const PRODUCTS = GROUPS.flatMap(build);

/*
 * Selectors used to live here. They now take a product list as their first
 * argument and live in `utils/catalog.js`, because the catalogue the shop
 * renders comes from the admin API at runtime — this array is only the
 * offline fallback. See `context/CatalogContext.jsx`.
 */

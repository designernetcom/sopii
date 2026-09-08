import type { Product, ProductVariant } from '@/types';
import { categories, categoryById } from './categories';
import { chance, daysAgo, pick, pickMany, rand, randInt, uid } from './seed';
import { slugify } from '@/utils/format';
import { COLORS, FABRICS, FITS, OCCASIONS, PATTERNS, SIZES } from '@/utils/constants';

interface Template {
  base: string;
  categoryId: string;
  price: [number, number];
  sizes: string[];
  colors: string[];
  fabricPool: string[];
}

const ADJECTIVES = [
  'Ivory', 'Midnight', 'Rosewood', 'Emerald', 'Saffron', 'Indigo', 'Blush', 'Mulberry',
  'Terracotta', 'Pearl', 'Coral', 'Sapphire', 'Amber', 'Olive', 'Champagne', 'Onyx',
];

const CRAFT = [
  'Handwoven', 'Block Printed', 'Zari Bordered', 'Chikankari', 'Ikat', 'Kalamkari',
  'Bandhani', 'Embroidered', 'Jamdani', 'Ajrakh',
];

/**
 * The catalogue ships four real photographs. Every product draws its gallery
 * from this pool, rotated by index so the grid does not read as one repeated
 * image. Add files to `public/media/products/` and list them here to widen it.
 */
export const PRODUCT_IMAGES = [
  '/media/products/saree-01.jpg',
  '/media/products/saree-02.jpg',
  '/media/products/saree-03.jpg',
  '/media/products/saree-04.jpg',
];

/** Rotates the pool so product `offset` leads with a different photo. */
function galleryFor(offset: number) {
  return PRODUCT_IMAGES.map(
    (_, i) => PRODUCT_IMAGES[(offset + i) % PRODUCT_IMAGES.length],
  );
}

const TEMPLATES: Template[] = [
  { base: 'Saree', categoryId: 'cat_sarees_cotton', price: [1899, 4499], sizes: ['Free Size'], colors: COLORS, fabricPool: ['Cotton', 'Khadi', 'Linen'] },
  { base: 'Silk Saree', categoryId: 'cat_sarees_silk', price: [6499, 18999], sizes: ['Free Size'], colors: COLORS, fabricPool: ['Silk', 'Banarasi Silk', 'Tussar'] },
  { base: 'Handloom Saree', categoryId: 'cat_sarees_handloom', price: [3499, 9999], sizes: ['Free Size'], colors: COLORS, fabricPool: ['Cotton', 'Chanderi', 'Tussar'] },
  { base: 'Festive Saree', categoryId: 'cat_sarees_festive', price: [5499, 22999], sizes: ['Free Size'], colors: COLORS, fabricPool: ['Organza', 'Georgette', 'Banarasi Silk'] },
  { base: 'Blouse', categoryId: 'cat_blouses_ready', price: [999, 2499], sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], colors: COLORS, fabricPool: ['Cotton', 'Silk', 'Rayon'] },
  { base: 'Designer Blouse', categoryId: 'cat_blouses_designer', price: [2499, 6999], sizes: ['S', 'M', 'L', 'XL'], colors: COLORS, fabricPool: ['Silk', 'Georgette', 'Organza'] },
  { base: 'Dress', categoryId: 'cat_women_dresses', price: [1999, 5999], sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: COLORS, fabricPool: ['Cotton', 'Linen', 'Rayon'] },
  { base: 'Kurta Set', categoryId: 'cat_women_kurta', price: [2499, 7499], sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: COLORS, fabricPool: ['Cotton', 'Chanderi', 'Khadi'] },
  { base: 'Co-ord Set', categoryId: 'cat_women_coords', price: [2999, 8499], sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: COLORS, fabricPool: ['Linen', 'Rayon', 'Cotton'] },
  { base: 'Dupatta', categoryId: 'cat_accessories_stoles', price: [899, 3499], sizes: ['Free Size'], colors: COLORS, fabricPool: ['Chanderi', 'Organza', 'Cotton'] },
  { base: 'Potli Bag', categoryId: 'cat_accessories_bags', price: [1199, 3299], sizes: ['Free Size'], colors: COLORS, fabricPool: ['Silk', 'Georgette'] },
  { base: 'Jhumka Earrings', categoryId: 'cat_jewellery_earrings', price: [799, 4499], sizes: ['Free Size'], colors: ['Gold', 'Silver', 'Oxidised'], fabricPool: ['Brass', 'Sterling Silver'] },
  { base: 'Temple Necklace', categoryId: 'cat_jewellery_necklaces', price: [2499, 12999], sizes: ['Free Size'], colors: ['Gold', 'Silver', 'Oxidised'], fabricPool: ['Brass', 'Sterling Silver'] },
];

const CARE = [
  'Dry clean only. Do not bleach. Iron on reverse at low heat.',
  'Hand wash separately in cold water. Dry in shade.',
  'Gentle machine wash. Do not tumble dry. Warm iron.',
  'Professional dry clean recommended for first wash.',
];

function skuFor(name: string, index: number) {
  const prefix = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.slice(0, 3).toUpperCase())
    .join('');
  return `SOP-${prefix}-${String(1000 + index)}`;
}

function buildVariants(product: {
  sku: string;
  price: number;
  sizes: string[];
  colors: string[];
  fabric: string;
  imageOffset: number;
}): ProductVariant[] {
  const gallery = galleryFor(product.imageOffset);
  const colors = pickMany(product.colors, randInt(2, 3));
  const sizes = product.sizes.length > 1 ? pickMany(product.sizes, randInt(3, 5)) : product.sizes;
  const ordered = SIZES.filter((s) => sizes.includes(s));
  const variants: ProductVariant[] = [];
  let n = 0;
  colors.forEach((color) => {
    (ordered.length ? ordered : sizes).forEach((size) => {
      n += 1;
      variants.push({
        id: `${product.sku}-v${n}`,
        sku: `${product.sku}-${color.slice(0, 2).toUpperCase()}${size === 'Free Size' ? 'FS' : size}`,
        color,
        size,
        fabric: product.fabric,
        price: product.price + (chance(0.25) ? randInt(1, 5) * 100 : 0),
        stock: randInt(0, 40),
        image: gallery[n % gallery.length],
      });
    });
  });
  return variants;
}

const TOTAL = 456;

export const products: Product[] = Array.from({ length: TOTAL }, (_, index) => {
  const template = TEMPLATES[index % TEMPLATES.length];
  const adjective = ADJECTIVES[(index * 3) % ADJECTIVES.length];
  const craft = CRAFT[(index * 5) % CRAFT.length];
  const name = `${adjective} ${craft} ${template.base}`;
  const slug = `${slugify(name)}-${index + 1}`;
  const sku = skuFor(name, index);

  const price = Math.round(randInt(template.price[0], template.price[1]) / 50) * 50 - 1;
  const mrp = Math.round((price * (1 + randInt(12, 45) / 100)) / 50) * 50 - 1;
  const costPrice = Math.round(price * (0.42 + rand() * 0.18));

  const fabric = pick(template.fabricPool);
  const gallery = galleryFor(index);
  const variants = buildVariants({
    sku,
    price,
    sizes: template.sizes,
    colors: template.colors,
    fabric,
    imageOffset: index,
  });

  const stock = variants.reduce((sum, v) => sum + v.stock, 0);
  const lowStockThreshold = randInt(6, 18);
  const unitsSold = randInt(4, 320);
  const rating = Number((3.4 + rand() * 1.6).toFixed(1));
  const createdAt = daysAgo(randInt(3, 400), 20);

  const status = index % 17 === 0 ? 'draft' : index % 29 === 0 ? 'archived' : 'published';

  return {
    id: uid('prd', index + 1),
    name,
    sku,
    slug,
    categoryId: template.categoryId,
    subcategoryId: undefined,
    brand: 'SOPII',
    shortDescription: `${craft} ${template.base.toLowerCase()} in ${fabric.toLowerCase()} — finished by hand in our ${pick(['Varanasi', 'Bhuj', 'Chanderi', 'Kanchipuram'])} studio.`,
    description: `The ${name} is part of the SOPII ${pick(['Everyday Luxe', 'Heritage', 'Festive', 'Studio'])} line. Woven in ${fabric.toLowerCase()} with a ${pick(PATTERNS).toLowerCase()} finish, it drapes softly and holds its structure through the day.\n\nEach piece is made in small batches with independent artisan clusters, so slight irregularities in weave and colour are natural and celebrate the handmade process.`,

    price,
    mrp,
    costPrice,
    taxRate: price > 1000 ? 12 : 5,

    barcode: `89${randInt(10000000000, 99999999999)}`,
    stock,
    lowStockThreshold,
    reserved: Math.min(stock, randInt(0, 8)),
    trackInventory: true,
    allowBackorders: chance(0.15),

    variants,
    images: gallery.map((url, i) => ({
      id: `${sku}-img-${i + 1}`,
      url,
      alt: `${name} — view ${i + 1}`,
      isMain: i === 0,
    })),

    details: {
      fabric,
      pattern: pick(PATTERNS),
      occasion: pick(OCCASIONS),
      fit: pick(FITS),
      careInstructions: pick(CARE),
      countryOfOrigin: 'India',
    },

    seo: {
      title: `${name} | SOPII`,
      metaDescription: `Shop the ${name} — ${fabric.toLowerCase()} ${template.base.toLowerCase()} handcrafted in India. Free shipping above ₹1,999.`,
      slug,
      keywords: [template.base.toLowerCase(), fabric.toLowerCase(), craft.toLowerCase(), 'sopii'],
      ogImage: gallery[0],
    },

    status,
    featured: chance(0.22),
    collectionIds: [],
    tags: pickMany([...FABRICS, ...OCCASIONS], randInt(2, 4)).map((t) => t.toLowerCase()),

    rating,
    reviewCount: randInt(0, 84),
    unitsSold,
    revenue: unitsSold * price,

    createdAt,
    updatedAt: daysAgo(randInt(0, 30), 20),
  } satisfies Product;
});

/** Roll product counts back up into the category tree. */
categories.forEach((category) => {
  const direct = products.filter((p) => p.categoryId === category.id).length;
  const children = categories.filter((c) => c.parentId === category.id);
  category.productCount =
    direct + children.reduce((sum, c) => sum + products.filter((p) => p.categoryId === c.id).length, 0);
});

export const productById = new Map(products.map((p) => [p.id, p]));

export function categoryNameOf(product: Product) {
  return categoryById.get(product.categoryId)?.name ?? 'Uncategorised';
}

export function parentCategoryNameOf(product: Product) {
  const category = categoryById.get(product.categoryId);
  if (!category) return 'Uncategorised';
  return category.parentId ? (categoryById.get(category.parentId)?.name ?? category.name) : category.name;
}

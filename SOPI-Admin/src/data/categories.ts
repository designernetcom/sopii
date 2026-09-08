import type { Category } from '@/types';
import { daysAgo } from './seed';

interface Spec {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description?: string;
}

const SPECS: Spec[] = [
  { id: 'cat_sarees', name: 'Sarees', slug: 'sarees', parentId: null, description: 'Handwoven, silk and everyday drapes crafted with Indian weavers.' },
  { id: 'cat_sarees_cotton', name: 'Cotton Sarees', slug: 'cotton-sarees', parentId: 'cat_sarees' },
  { id: 'cat_sarees_silk', name: 'Silk Sarees', slug: 'silk-sarees', parentId: 'cat_sarees' },
  { id: 'cat_sarees_handloom', name: 'Handloom Sarees', slug: 'handloom-sarees', parentId: 'cat_sarees' },
  { id: 'cat_sarees_festive', name: 'Festive Sarees', slug: 'festive-sarees', parentId: 'cat_sarees' },

  { id: 'cat_blouses', name: 'Blouses', slug: 'blouses', parentId: null, description: 'Ready-to-wear and made-to-measure blouses.' },
  { id: 'cat_blouses_ready', name: 'Ready to Wear', slug: 'ready-to-wear-blouses', parentId: 'cat_blouses' },
  { id: 'cat_blouses_designer', name: 'Designer Blouses', slug: 'designer-blouses', parentId: 'cat_blouses' },

  { id: 'cat_women', name: 'Women', slug: 'women', parentId: null, description: 'Contemporary silhouettes for every day.' },
  { id: 'cat_women_dresses', name: 'Dresses', slug: 'dresses', parentId: 'cat_women' },
  { id: 'cat_women_kurta', name: 'Kurta Sets', slug: 'kurta-sets', parentId: 'cat_women' },
  { id: 'cat_women_coords', name: 'Co-ords', slug: 'co-ords', parentId: 'cat_women' },

  { id: 'cat_accessories', name: 'Accessories', slug: 'accessories', parentId: null, description: 'Bags, stoles and finishing touches.' },
  { id: 'cat_accessories_stoles', name: 'Stoles & Dupattas', slug: 'stoles-dupattas', parentId: 'cat_accessories' },
  { id: 'cat_accessories_bags', name: 'Potli Bags', slug: 'potli-bags', parentId: 'cat_accessories' },

  { id: 'cat_jewellery', name: 'Jewellery', slug: 'jewellery', parentId: null, description: 'Handcrafted silver and temple jewellery.' },
  { id: 'cat_jewellery_earrings', name: 'Earrings', slug: 'earrings', parentId: 'cat_jewellery' },
  { id: 'cat_jewellery_necklaces', name: 'Necklaces', slug: 'necklaces', parentId: 'cat_jewellery' },
];

export const categories: Category[] = SPECS.map((spec, index) => ({
  id: spec.id,
  name: spec.name,
  slug: spec.slug,
  description:
    spec.description ?? `${spec.name} curated by the SOPII design studio.`,
  image: `/media/categories/${spec.slug}.jpg`,
  parentId: spec.parentId,
  sortOrder: index,
  status: 'active',
  productCount: 0,
  createdAt: daysAgo(420 - index * 6),
}));

export const categoryById = new Map(categories.map((c) => [c.id, c]));

/** Leaf categories are the ones products actually attach to. */
export const leafCategories = categories.filter((c) => c.parentId !== null);

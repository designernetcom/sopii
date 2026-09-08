/** Home page "Shop by Category" tiles and canonical category taxonomy. */

export const CATEGORIES = [
  {
    name: 'Sarees',
    slug: 'sarees',
    to: '/sarees',
    blurb: 'Handwoven, draped, endlessly re-worn',
    seed: 301,
    tags: 'saree',
    image:
      'https://suta.in/cdn/shop/files/saree_9656048d-67a5-4c6b-93b9-5fe16f6ef69d.jpg?format=webp&v=1752903494&width=1200',
  },
  {
    name: 'Blouses',
    slug: 'blouses',
    to: '/blouses',
    blurb: 'The piece that finishes the drape',
    seed: 302,
    tags: 'blouse',
    image:
      'https://suta.in/cdn/shop/files/Blouse_246f00ce-a14f-48bc-ab1f-97bd4f2bd429.jpg?format=webp&v=1752903535&width=1200',
  },
  {
    name: 'Dresses',
    slug: 'dresses',
    to: '/shop?category=Dresses',
    blurb: 'Easy shapes, considered details',
    seed: 303,
    tags: 'dress',
    image:
      'https://suta.in/cdn/shop/files/Dress_9b943c2b-cc46-436c-abd2-7f9fa1081829.jpg?format=webp&v=1752903598&width=1200',
  },
  {
    name: 'Kurta Sets',
    slug: 'kurta-sets',
    to: '/shop?category=Kurta+Sets',
    blurb: 'Cotton comfort, festive polish',
    seed: 304,
    tags: 'kurta',
    image:
      'https://suta.in/cdn/shop/files/Women_Kurta_48b4326a-29bd-46bb-b479-1782742c8203.jpg?format=webp&v=1752903557&width=1200',
  },
  {
    name: 'Jewellery',
    slug: 'jewellery',
    to: '/shop?category=Jewellery',
    blurb: 'Oxidised silver and pearl',
    seed: 305,
    tags: 'jewellery',
    image:
      'https://suta.in/cdn/shop/files/saree_9656048d-67a5-4c6b-93b9-5fe16f6ef69d.jpg?format=webp&v=1752903494&width=1200',
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    to: '/shop?category=Accessories',
    blurb: 'Bags, stoles and small joys',
    seed: 306,
    tags: 'handbag',
    image:
      'https://suta.in/cdn/shop/files/men_shirt_a94b3669-cf37-4e2c-b6fc-f20ee013e9f7.jpg?format=webp&v=1752903744&width=1200',
  },
];

/** Canonical product categories used by filters and routing. */
export const PRODUCT_CATEGORIES = [
  'Sarees',
  'Blouses',
  'Dresses',
  'Kurta Sets',
  'Co-ords',
  'Jewellery',
  'Accessories',
];

/** Named colour swatches — the single source of truth for colour hexes. */
export const COLOR_SWATCHES = {
  Ivory: '#F3EDE3',
  'Off White': '#FAF7F1',
  Indigo: '#2E4374',
  Charcoal: '#33312D',
  Black: '#1A1A1A',
  Terracotta: '#B5623C',
  Mustard: '#C89B3C',
  Olive: '#6B7350',
  'Rose Pink': '#D89AA4',
  Maroon: '#6E2434',
  Teal: '#276A6A',
  Beige: '#DCCBB4',
  Gold: '#B08D57',
  Silver: '#B9BCC0',
  Emerald: '#2C6B52',
  Lavender: '#B0A3C7',
  Rust: '#9C4A28',
  Sky: '#8FB2CC',
  Coral: '#E1836C',
  Wine: '#5C2437',
};

export const FABRICS = [
  'Cotton',
  'Silk',
  'Linen',
  'Handloom',
  'Chanderi',
  'Georgette',
  'Organza',
  'Khadi',
  'Tussar',
  'Brocade',
  'Rayon',
  'Metal',
  'Leather',
  'Jute',
];

export const OCCASION_TAGS = [
  'Everyday',
  'Office Wear',
  'Festive',
  'Wedding',
  'Party',
  'Vacation',
];

export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Free Size'];

/**
 * Header navigation + mega menu structure.
 * `columns` renders a mega panel; omit it for a plain link.
 */

/**
 * The artwork in the right third of every mega panel.
 *
 * One image for all of them, set here rather than per nav item: it is brand
 * furniture, not a promotion, so there is nothing to keep in step with a
 * collection. Set it to an empty string to close the panel back up to links
 * only.
 */
export const MEGA_MENU_BANNER =
  'https://res.cloudinary.com/w2brnx9l/image/upload/v1788955282/images_1.jpg';

/**
 * The categories the header is allowed to carry.
 *
 * The live nav is built from whatever categories the admin panel publishes
 * (`buildNavigation` in `services/adapters`), and the panel holds more of them
 * than the header should show — Blouses, Women, Accessories and Jewellery are
 * all shoppable, they are simply not top-level nav. A name listed here opts
 * that category in, matched case-insensitively; an empty list means "show every
 * published category", which is the old behaviour.
 */
export const HEADER_CATEGORIES = ['Sarees'];

export const NAV_ITEMS = [
  {
    label: 'New Arrivals',
    to: '/new-arrivals',
  },
  {
    label: 'Sarees',
    to: '/sarees',
    columns: [
      {
        title: 'Shop Sarees',
        links: [
          { label: 'All Sarees', to: '/sarees' },
          { label: 'New Arrivals', to: '/sarees?badge=New' },
          { label: 'Bestsellers', to: '/sarees?badge=Bestseller' },
          { label: 'Under ₹3000', to: '/sarees?maxPrice=3000' },
        ],
      },
      {
        title: 'By Fabric',
        links: [
          { label: 'Cotton Sarees', to: '/sarees?fabric=Cotton' },
          { label: 'Silk Sarees', to: '/sarees?fabric=Silk' },
          { label: 'Linen Sarees', to: '/sarees?fabric=Linen' },
          { label: 'Handloom Sarees', to: '/sarees?fabric=Handloom' },
        ],
      },
      {
        title: 'By Occasion',
        links: [
          { label: 'Everyday', to: '/sarees?occasion=Everyday' },
          { label: 'Festive Sarees', to: '/sarees?occasion=Festive' },
          { label: 'Party Wear', to: '/sarees?occasion=Party' },
          { label: 'Wedding', to: '/sarees?occasion=Wedding' },
        ],
      },
    ],
  },
  // {
  //   label: 'Blouses',
  //   to: '/blouses',
  //   columns: [
  //     {
  //       title: 'Shop Blouses',
  //       links: [
  //         { label: 'All Blouses', to: '/blouses' },
  //         { label: 'New Arrivals', to: '/blouses?badge=New' },
  //         { label: 'Bestsellers', to: '/blouses?badge=Bestseller' },
  //         { label: 'Under ₹1500', to: '/blouses?maxPrice=1500' },
  //       ],
  //     },
  //     {
  //       title: 'By Style',
  //       links: [
  //         { label: 'Puff Sleeve', to: '/blouses?q=puff' },
  //         { label: 'Embroidered', to: '/blouses?q=embroidered' },
  //         { label: 'Sleeveless', to: '/blouses?q=sleeveless' },
  //         { label: 'Corset', to: '/blouses?q=corset' },
  //       ],
  //     },
  //   ],
  // },
  // {
  //   label: 'Women',
  //   to: '/women',
  //   columns: [
  //     {
  //       title: 'Apparel',
  //       links: [
  //         { label: 'Dresses', to: '/shop?category=Dresses' },
  //         { label: 'Kurta Sets', to: '/shop?category=Kurta+Sets' },
  //         { label: 'Co-ords', to: '/shop?category=Co-ords' },
  //         { label: 'Tops', to: '/shop?category=Blouses' },
  //       ],
  //     },
  //     {
  //       title: 'More',
  //       links: [
  //         { label: 'Trousers', to: '/shop?category=Co-ords' },
  //         { label: 'Dupattas', to: '/shop?category=Accessories&q=dupatta' },
  //         { label: 'Jackets', to: '/shop?category=Co-ords' },
  //         { label: 'Shop All Women', to: '/women' },
  //       ],
  //     },
  //   ],
  // },
  {
    label: 'Collections',
    to: '/collections',
  },
  {
    label: 'Bestsellers',
    to: '/bestsellers',
  },
  {
    label: 'Sale',
    to: '/sale',
    accent: true,
  },
  // {
  //   label: 'Accessories',
  //   to: '/shop?category=Accessories',
  //   columns: [
  //     {
  //       title: 'Accessories',
  //       links: [
  //         { label: 'Bags', to: '/shop?category=Accessories&q=bag' },
  //         { label: 'Hair Accessories', to: '/shop?category=Accessories&q=hair' },
  //         { label: 'Belts', to: '/shop?category=Accessories&q=belt' },
  //         { label: 'Gift Items', to: '/shop?category=Accessories&q=gift' },
  //       ],
  //     },
  //     {
  //       title: 'Jewellery',
  //       links: [
  //         { label: 'All Jewellery', to: '/shop?category=Jewellery' },
  //         { label: 'Earrings', to: '/shop?category=Jewellery&q=earring' },
  //         { label: 'Necklaces', to: '/shop?category=Jewellery&q=necklace' },
  //         { label: 'Bangles & Rings', to: '/shop?category=Jewellery&q=bangle' },
  //       ],
  //     },
  //   ],
  // },
];

/** Bottom tab bar on mobile. */
export const MOBILE_TABS = [
  { label: 'Home', to: '/', icon: 'Home' },
  { label: 'Shop', to: '/shop', icon: 'LayoutGrid' },
  { label: 'Search', action: 'search', icon: 'Search' },
  { label: 'Wishlist', to: '/wishlist', icon: 'Heart' },
  { label: 'Account', to: '/account', icon: 'User' },
];

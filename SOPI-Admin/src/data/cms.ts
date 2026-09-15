import type {
  Announcement,
  AppNotification,
  Banner,
  HomeSection,
  MediaAsset,
  MediaFolder,
} from '@/types';
import { chance, daysAgo, daysAhead, pick, randInt, uid } from './seed';
import { products } from './products';
import { orders } from './orders';
import { customers } from './customers';

/* --------------------------------- banners --------------------------------- */

export const banners: Banner[] = [
  {
    id: 'ban_0001',
    title: 'Festive Hero',
    heading: 'The Festive Edit',
    subheading: 'Handwoven silks and zari borders for the season of celebration.',
    desktopImage: '/media/banners/festive-desktop.jpg',
    mobileImage: '/media/banners/festive-mobile.jpg',
    buttonText: 'Shop the Edit',
    buttonLink: '/collections/festive-edit',
    startDate: daysAgo(20),
    endDate: daysAhead(45),
    sortOrder: 0,
    status: 'active',
  },
  {
    id: 'ban_0002',
    title: 'New Arrivals',
    heading: 'Fresh off the Loom',
    subheading: 'New pieces added every Thursday.',
    desktopImage: '/media/banners/new-arrivals-desktop.jpg',
    mobileImage: '/media/banners/new-arrivals-mobile.jpg',
    buttonText: 'Explore New In',
    buttonLink: '/collections/new-arrivals',
    startDate: daysAgo(60),
    sortOrder: 1,
    status: 'active',
  },
  {
    id: 'ban_0003',
    title: 'Wedding Campaign',
    heading: 'Woven for Forever',
    subheading: 'Heirloom-grade weaves for the wedding calendar.',
    desktopImage: '/media/banners/wedding-desktop.jpg',
    mobileImage: '/media/banners/wedding-mobile.jpg',
    buttonText: 'View Collection',
    buttonLink: '/collections/wedding-collection',
    startDate: daysAhead(10),
    endDate: daysAhead(80),
    sortOrder: 2,
    status: 'inactive',
  },
  {
    id: 'ban_0004',
    title: 'Summer Cotton',
    heading: 'Cotton, Reimagined',
    subheading: 'Breathable everyday drapes under ₹2,499.',
    desktopImage: '/media/banners/summer-desktop.jpg',
    mobileImage: '/media/banners/summer-mobile.jpg',
    buttonText: 'Shop Cotton',
    buttonLink: '/collections/summer-collection',
    startDate: daysAgo(120),
    endDate: daysAgo(10),
    sortOrder: 3,
    status: 'inactive',
  },
];

/* ----------------------------- homepage sections --------------------------- */

export const homeSections: HomeSection[] = [
  { id: 'sec_hero', key: 'hero', title: 'Hero Banner', subtitle: 'Rotating campaign banners', enabled: true, sortOrder: 0 },
  { id: 'sec_categories', key: 'categories', title: 'Shop by Category', subtitle: 'Category tiles', enabled: true, sortOrder: 1, itemLimit: 6 },
  { id: 'sec_new', key: 'new_arrivals', title: 'New Arrivals', subtitle: 'Latest drops', enabled: true, sortOrder: 2, itemLimit: 8 },
  { id: 'sec_best', key: 'bestsellers', title: 'Bestsellers', subtitle: 'Most loved this month', enabled: true, sortOrder: 3, itemLimit: 8 },
  { id: 'sec_collections', key: 'collections', title: 'Curated Collections', subtitle: 'Featured collection banners', enabled: true, sortOrder: 4, itemLimit: 3 },
  { id: 'sec_featured', key: 'featured', title: 'Featured Products', subtitle: 'Hand-picked by the studio', enabled: false, sortOrder: 5, itemLimit: 4 },
  { id: 'sec_reviews', key: 'reviews', title: 'Customer Reviews', subtitle: 'Social proof carousel', enabled: true, sortOrder: 6, itemLimit: 6 },
  { id: 'sec_instagram', key: 'instagram', title: 'Instagram Feed', subtitle: '@sopii.studio', enabled: true, sortOrder: 7, itemLimit: 8 },
  { id: 'sec_newsletter', key: 'newsletter', title: 'Newsletter Signup', subtitle: 'Email capture block', enabled: true, sortOrder: 8 },
];

/* ------------------------------- announcements ----------------------------- */

/*
 * The storefront strip's starting copy — the messages the shop front used to
 * hard-code, so a freshly seeded store looks the way it did before the strip
 * became editable. Fixed timestamps rather than `daysAgo()`: the order of
 * equal priorities falls back to `createdAt`, and it should not shuffle
 * between seeds.
 */
export const announcements: Announcement[] = [
  {
    id: 'ann_0001',
    message: 'Free shipping above ₹19999',
    isActive: true,
    priority: 1,
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ann_0002',
    message: 'No returns',
    isActive: true,
    priority: 2,
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ann_0003',
    message: 'COD available across India',
    isActive: false,
    priority: 3,
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ann_0004',
    message: 'Handcrafted in India',
    isActive: true,
    priority: 4,
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/* ---------------------------------- media ---------------------------------- */

const FOLDERS: MediaFolder[] = ['products', 'banners', 'categories', 'collections', 'blog', 'other'];

export const media: MediaAsset[] = Array.from({ length: 48 }, (_, index) => {
  const folder = FOLDERS[index % FOLDERS.length];
  const product = pick(products);
  const name =
    folder === 'products'
      ? `${product.slug}-${randInt(1, 4)}.jpg`
      : `${folder}-${String(index + 1).padStart(2, '0')}.jpg`;
  const isBanner = folder === 'banners' || folder === 'collections';

  return {
    id: uid('med', index + 1),
    name,
    url: `/media/${folder}/${name}`,
    folder,
    mimeType: chance(0.1) ? 'image/png' : 'image/jpeg',
    size: randInt(80_000, 2_400_000),
    width: isBanner ? 1920 : 1200,
    height: isBanner ? 720 : 1600,
    alt: folder === 'products' ? product.name : `SOPII ${folder} asset`,
    uploadedBy: pick(['Rajesh Gawas', 'Meera Nair', 'Aditya Rao']),
    createdAt: daysAgo(randInt(0, 300), 23),
  } satisfies MediaAsset;
}).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

/* ------------------------------ notifications ------------------------------ */

export const notifications: AppNotification[] = (() => {
  const list: AppNotification[] = [];
  const recentOrders = orders.slice(0, 8);

  recentOrders.forEach((order, i) => {
    list.push({
      id: uid('ntf', list.length + 1),
      type: 'new_order',
      title: `New order ${order.code}`,
      message: `${order.customerName} placed an order worth ₹${order.total.toLocaleString('en-IN')}.`,
      link: `/admin/orders/${order.id}`,
      read: i > 2,
      createdAt: order.placedAt,
    });
    if (order.paymentStatus === 'paid' && i < 4) {
      list.push({
        id: uid('ntf', list.length + 1),
        type: 'payment_received',
        title: 'Payment received',
        message: `₹${order.total.toLocaleString('en-IN')} received for ${order.code}.`,
        link: `/admin/orders/${order.id}`,
        read: i > 1,
        createdAt: order.placedAt,
      });
    }
  });

  products
    .filter((p) => p.stock <= p.lowStockThreshold)
    .slice(0, 6)
    .forEach((product) => {
      list.push({
        id: uid('ntf', list.length + 1),
        type: product.stock === 0 ? 'low_stock' : 'low_stock',
        title: product.stock === 0 ? 'Out of stock' : 'Low stock alert',
        message: `${product.name} has ${product.stock} unit(s) left (threshold ${product.lowStockThreshold}).`,
        link: `/admin/inventory`,
        read: chance(0.4),
        createdAt: daysAgo(randInt(0, 6), 23),
      });
    });

  customers.slice(0, 4).forEach((customer) => {
    list.push({
      id: uid('ntf', list.length + 1),
      type: 'new_customer',
      title: 'New customer registered',
      message: `${customer.name} created an account.`,
      link: `/admin/customers/${customer.id}`,
      read: chance(0.5),
      createdAt: customer.createdAt,
    });
  });

  orders
    .filter((o) => o.status === 'cancelled')
    .slice(0, 3)
    .forEach((order) => {
      list.push({
        id: uid('ntf', list.length + 1),
        type: 'order_cancelled',
        title: `Order ${order.code} cancelled`,
        message: `${order.customerName} cancelled an order worth ₹${order.total.toLocaleString('en-IN')}.`,
        link: `/admin/orders/${order.id}`,
        read: chance(0.6),
        createdAt: order.updatedAt,
      });
    });

  orders
    .filter((o) => o.status === 'returned')
    .slice(0, 3)
    .forEach((order) => {
      list.push({
        id: uid('ntf', list.length + 1),
        type: 'return_requested',
        title: 'Return requested',
        message: `${order.customerName} requested a return for ${order.code}.`,
        link: `/admin/orders/${order.id}`,
        read: chance(0.5),
        createdAt: order.updatedAt,
      });
    });

  return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
})();

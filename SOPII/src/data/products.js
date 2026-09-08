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
  ['Meherzad Silk Blend Saree', 6490, 8490, 4.7, 96, 'Bestseller', 'Silk', ['Maroon', 'Emerald'], ['Festive', 'Wedding'],
    'A lustrous silk-blend saree with a broad woven border that catches light as you move. Substantial enough to hold a sculpted pleat, light enough to wear through a long evening.'],
  ['Kalyani Chanderi Saree', 5290, 6290, 4.9, 211, 'Bestseller', 'Chanderi', ['Off White', 'Rose Pink', 'Sky'], ['Festive', 'Office Wear'],
    'Sheer Chanderi with a whisper of gold zari through the body. The transparency is intentional — layer it over a matched slip for the classic Chanderi glow.'],
  ['Nayantara Linen Saree', 4490, 5490, 4.6, 78, 'New', 'Linen', ['Beige', 'Olive', 'Charcoal'], ['Office Wear', 'Everyday'],
    'Crisp pure linen that holds a sharp pleat all day. Cut with a narrow tonal border so it reads as quiet, considered and entirely at home in a boardroom.'],
  ['Ishira Mulmul Cotton Saree', 2790, 3490, 4.7, 168, null, 'Cotton', ['Ivory', 'Sky', 'Coral'], ['Everyday', 'Vacation'],
    'Six yards of double-gauze mulmul, the lightest thing in the wardrobe. Made for humid afternoons, long train journeys and days that ask nothing of you.'],
  ['Rukmini Kanjivaram Silk Saree', 14990, 18990, 4.9, 64, null, 'Silk', ['Maroon', 'Gold', 'Emerald'], ['Wedding', 'Festive'],
    'A traditional Kanjivaram with a contrast korvai border joined by hand. Pure mulberry silk and real zari — the piece you keep, and then pass on.'],
  ['Tanisha Block Print Saree', 2990, 3790, 4.5, 142, null, 'Cotton', ['Indigo', 'Rust', 'Mustard'], ['Everyday', 'Vacation'],
    'Hand-blocked in Bagru using natural indigo and madder. Every repeat sits slightly differently — the honest signature of a wooden block pressed by hand.'],
  ['Vaidehi Tussar Silk Saree', 7990, 9490, 4.8, 87, null, 'Tussar', ['Beige', 'Gold', 'Rust'], ['Festive', 'Office Wear'],
    'Raw Tussar with its characteristic slubbed texture and warm honey cast. Wears with a dry, matte elegance that polished silks never quite reach.'],
  ['Amoli Organza Saree', 6790, 8290, 4.6, 59, 'New', 'Organza', ['Lavender', 'Off White', 'Rose Pink'], ['Party', 'Festive'],
    'Airy organza with hand-embroidered scattered florals across the pallu. Holds its own shape, so the drape stays sculptural through the night.'],
  ['Sharvari Handloom Cotton Saree', 3290, 4290, 4.7, 133, null, 'Handloom', ['Teal', 'Ivory', 'Mustard'], ['Everyday', 'Office Wear'],
    'A broad striped handloom in undyed and vegetable-dyed yarn. Woven in Kerala by a cooperative SOPII has worked with since our first collection.'],
  ['Devika Banarasi Silk Saree', 12490, 15990, 4.9, 102, 'Bestseller', 'Brocade', ['Wine', 'Emerald', 'Gold'], ['Wedding', 'Festive'],
    'Banarasi brocade woven with a dense kadhwa buti across the field. Weighty, ceremonial and unmistakably meant for the biggest day on the calendar.'],
  ['Anwesha Khadi Saree', 3490, 4290, 4.5, 71, null, 'Khadi', ['Off White', 'Charcoal', 'Olive'], ['Everyday', 'Office Wear'],
    'Hand-spun, hand-woven khadi with a satisfying grain you can feel between your fingers. It relaxes into you over the first few wears.'],
  ['Prisha Georgette Saree', 4190, 5490, 4.4, 88, null, 'Georgette', ['Black', 'Wine', 'Teal'], ['Party', 'Office Wear'],
    'Fluid georgette that falls in a clean unbroken line. Minimal, dark and quietly dramatic — the easiest saree to reach for after work.'],
  ['Malhaar Jamdani Saree', 8990, 11490, 4.8, 53, 'New', 'Handloom', ['Ivory', 'Sky', 'Emerald'], ['Festive', 'Wedding'],
    'Fine-count Jamdani with motifs floated into the weave by hand on a traditional loom. Roughly nine weeks of work in every saree.'],
  ['Suhani Zari Border Saree', 5990, 7490, 4.6, 116, null, 'Silk', ['Rose Pink', 'Ivory', 'Gold'], ['Festive', 'Wedding'],
    'A soft-sheen silk body edged with a two-inch antique zari border. Restrained enough for a puja, luminous enough for a reception.'],
  ['Rohini Ikat Cotton Saree', 4690, 5990, 4.7, 95, null, 'Cotton', ['Indigo', 'Maroon', 'Mustard'], ['Everyday', 'Festive'],
    'Double ikat in which every yarn is resist-dyed before it ever meets the loom. The gently blurred motif edges are the proof of the technique.'],
  ['Charulata Maheshwari Saree', 5490, 6790, 4.8, 129, 'Bestseller', 'Chanderi', ['Beige', 'Teal', 'Wine'], ['Festive', 'Office Wear'],
    'The classic Maheshwari reversible border with its fine bugdi stripe. Cotton-silk, so it carries a subtle sheen without any of the weight.'],
  ['Trisha Ruffle Saree', 3890, 4990, 4.3, 67, null, 'Georgette', ['Black', 'Coral', 'Lavender'], ['Party', 'Vacation'],
    'A pre-stitched ruffle hem that moves beautifully and needs almost no styling. Our answer to getting saree-ready in four minutes flat.'],
  ['Vasudha Kalamkari Saree', 6290, 7990, 4.7, 74, null, 'Cotton', ['Rust', 'Beige', 'Indigo'], ['Festive', 'Everyday'],
    'Hand-painted Kalamkari narrating a temple frieze across the pallu, drawn with a bamboo kalam and natural dyes over several weeks.'],
  ['Netra Sequin Party Saree', 7490, 9990, 4.5, 61, 'New', 'Georgette', ['Silver', 'Black', 'Emerald'], ['Party', 'Wedding'],
    'All-over tonal sequins on a fluid georgette base. Deliberately monochrome so it glitters without ever tipping into loud.'],
];

/* ============================ BLOUSES (10) =============================== */
const BLOUSES = [
  ['Ira Puff Sleeve Blouse', 1490, 1990, 4.7, 156, 'Bestseller', 'Cotton', ['Ivory', 'Black', 'Terracotta'], ['Everyday', 'Festive'],
    'A structured cotton blouse with a gathered puff sleeve that stands up on its own. Lined, boned at the seams and cut to sit flush at the waist.'],
  ['Kiara Boat Neck Blouse', 1290, 1690, 4.6, 132, null, 'Cotton', ['Off White', 'Indigo', 'Olive'], ['Everyday', 'Office Wear'],
    'A wide boat neck with a deep back and a single covered button. The quietest blouse we make, and the one that goes with everything.'],
  ['Manvi Embroidered Blouse', 2490, 3290, 4.8, 98, 'Bestseller', 'Silk', ['Maroon', 'Gold', 'Emerald'], ['Wedding', 'Festive'],
    'Hand-embroidered zardozi across the yoke and sleeve caps on a silk base. Fully lined, with a concealed side zip so the front stays uninterrupted.'],
  ['Sanya Corset Blouse', 2790, 3490, 4.5, 74, 'New', 'Brocade', ['Wine', 'Black', 'Gold'], ['Party', 'Wedding'],
    'A boned corset silhouette in brocade with a laced back that adjusts across two sizes. Built to be worn with a saree or a high-waisted skirt.'],
  ['Ahaana Cotton Crop Blouse', 990, 1390, 4.4, 187, null, 'Cotton', ['Ivory', 'Sky', 'Coral'], ['Everyday', 'Vacation'],
    'An unlined cotton crop with cap sleeves and a hook-and-eye back. Breathable, packable and priced to buy in three colours at once.'],
  ['Reva Bell Sleeve Blouse', 1890, 2490, 4.6, 89, null, 'Georgette', ['Black', 'Lavender', 'Teal'], ['Party', 'Festive'],
    'A fitted bodice with a dramatic sheer bell sleeve that falls to the wrist. Movement is the whole point of this one.'],
  ['Aditi Backless Silk Blouse', 2290, 2990, 4.7, 66, null, 'Silk', ['Ivory', 'Wine', 'Emerald'], ['Wedding', 'Party'],
    'A deep U back finished with a single silk tie. Fully lined in cotton so the silk never clings, however long the evening runs.'],
  ['Niyati Brocade Blouse', 2190, 2890, 4.6, 81, null, 'Brocade', ['Gold', 'Maroon', 'Teal'], ['Festive', 'Wedding'],
    'Woven brocade with a high mandarin collar and elbow sleeve. Sharp, covered-up and a genuine relief during a long ceremony.'],
  ['Tara Sleeveless Blouse', 1190, 1590, 4.5, 143, null, 'Cotton', ['Off White', 'Charcoal', 'Mustard'], ['Everyday', 'Office Wear'],
    'A clean sleeveless shell with a scoop neck and princess seams. Wear it under a saree, or on its own with wide-leg trousers.'],
  ['Zoya Ruffle Sleeve Blouse', 1690, 2190, 4.4, 77, 'New', 'Rayon', ['Rose Pink', 'Ivory', 'Sky'], ['Party', 'Vacation'],
    'A soft tiered ruffle at the shoulder in fluid rayon. Relaxed through the body, so it doubles happily as a summer top.'],
];

/* ============================ DRESSES (10) =============================== */
const DRESSES = [
  ['Amara Tiered Midi Dress', 3490, 4490, 4.7, 164, 'Bestseller', 'Cotton', ['Ivory', 'Indigo', 'Terracotta'], ['Everyday', 'Vacation'],
    'Three gathered tiers of hand-blocked cotton with deep side pockets. Falls just below the calf and only gets better crumpled.'],
  ['Leela Wrap Dress', 3890, 4890, 4.6, 121, null, 'Rayon', ['Black', 'Olive', 'Rose Pink'], ['Office Wear', 'Party'],
    'A true wrap with an inner tie and a generous overlap, so it stays where you put it. Cut on the bias for a clean fall over the hip.'],
  ['Anaya Cotton Shirt Dress', 3290, 4190, 4.5, 108, null, 'Cotton', ['Off White', 'Sky', 'Olive'], ['Office Wear', 'Everyday'],
    'A crisp shirt dress with a removable belt and a hidden placket. Wear it buttoned for work, open over a slip on the weekend.'],
  ['Myra Slip Dress', 4290, 5490, 4.6, 87, 'New', 'Silk', ['Charcoal', 'Wine', 'Beige'], ['Party', 'Vacation'],
    'A bias-cut silk slip with adjustable straps and a French-seamed finish inside. Minimal on the hanger, quietly devastating on.'],
  ['Saira Kaftan Dress', 3690, 4690, 4.7, 95, null, 'Georgette', ['Coral', 'Teal', 'Ivory'], ['Vacation', 'Everyday'],
    'A floor-length kaftan with hand-tasselled side slits and an embroidered neckline. Weightless, forgiving and made for heat.'],
  ['Ridhi Panelled Maxi Dress', 4690, 5990, 4.8, 73, null, 'Linen', ['Beige', 'Rust', 'Charcoal'], ['Office Wear', 'Everyday'],
    'Eight linen panels release into a soft flare at the hem. Structured at the shoulder, fluid everywhere else.'],
  ['Noor Smocked Dress', 2990, 3890, 4.4, 132, null, 'Cotton', ['Rose Pink', 'Sky', 'Ivory'], ['Everyday', 'Vacation'],
    'A hand-smocked bodice that stretches to fit and a full gathered skirt. The most comfortable thing in the collection, by some distance.'],
  ['Aria Linen Shift Dress', 3390, 4290, 4.5, 91, null, 'Linen', ['Off White', 'Olive', 'Mustard'], ['Office Wear', 'Everyday'],
    'A straight shift in heavyweight linen with dropped shoulders and a split hem. Architectural, unfussy, endlessly re-wearable.'],
  ['Bela Floral Tea Dress', 3190, 4090, 4.6, 118, null, 'Rayon', ['Lavender', 'Coral', 'Emerald'], ['Everyday', 'Party'],
    'A midi tea dress in a small hand-drawn floral, with a shirred back and elbow sleeves. Deliberately old-fashioned in the best way.'],
  ['Kaveri Draped Dress', 5290, 6790, 4.7, 64, 'New', 'Georgette', ['Black', 'Wine', 'Gold'], ['Party', 'Wedding'],
    'An asymmetric drape gathered at one hip and pinned with a covered brooch. A saree-inspired silhouette that takes thirty seconds to wear.'],
];

/* =========================== KURTA SETS (6) ============================== */
const KURTA_SETS = [
  ['Saanvi Cotton Kurta Set', 3490, 4490, 4.7, 176, 'Bestseller', 'Cotton', ['Ivory', 'Indigo', 'Mustard'], ['Everyday', 'Office Wear'],
    'A straight-cut kurta with side slits, matched palazzo and a mulmul dupatta. Hand-blocked in a small repeat that reads as solid from a distance.'],
  ['Diya Chanderi Kurta Set', 5490, 6990, 4.8, 112, null, 'Chanderi', ['Rose Pink', 'Off White', 'Teal'], ['Festive', 'Wedding'],
    'Chanderi kurta with fine gota detailing at the placket, worn over a cotton slip and finished with a sheer dupatta.'],
  ['Anika Angrakha Kurta Set', 4290, 5490, 4.6, 88, null, 'Cotton', ['Terracotta', 'Olive', 'Ivory'], ['Everyday', 'Festive'],
    'A traditional angrakha wrap tied at the side seam, with tapered churidar. Adjusts comfortably across a size in either direction.'],
  ['Meera Silk Kurta Set', 6990, 8990, 4.8, 67, 'New', 'Silk', ['Emerald', 'Maroon', 'Gold'], ['Wedding', 'Festive'],
    'Raw silk kurta with a boat neck and a heavy pleated sharara. Ceremonial weight, cut clean enough to avoid feeling costumey.'],
  ['Tanvi Kurta & Palazzo Set', 2990, 3890, 4.5, 149, null, 'Rayon', ['Sky', 'Lavender', 'Charcoal'], ['Everyday', 'Office Wear'],
    'An easy everyday two-piece in soft rayon with a mandarin collar and deep pockets. Machine washable and genuinely low-maintenance.'],
  ['Ravya Embroidered Kurta Set', 5890, 7490, 4.7, 79, null, 'Georgette', ['Wine', 'Black', 'Beige'], ['Party', 'Festive'],
    'Thread-embroidered georgette kurta over a lined slip, with a scalloped dupatta edge finished by hand.'],
];

/* ============================= CO-ORDS (4) =============================== */
const COORDS = [
  ['Ahilya Linen Co-ord Set', 5490, 6990, 4.6, 84, 'New', 'Linen', ['Beige', 'Olive', 'Off White'], ['Office Wear', 'Vacation'],
    'A relaxed linen shirt and wide-leg trouser cut to be worn together or entirely apart. Half-lined trousers, so nothing clings.'],
  ['Rhea Printed Co-ord Set', 4290, 5490, 4.5, 97, null, 'Rayon', ['Coral', 'Indigo', 'Ivory'], ['Vacation', 'Everyday'],
    'A cropped tie-front top with matched shorts in a hand-drawn print. Packs to almost nothing, which is the point.'],
  ['Sana Quilted Jacket Set', 6490, 8290, 4.7, 58, null, 'Cotton', ['Rust', 'Charcoal', 'Mustard'], ['Everyday', 'Festive'],
    'A hand-quilted reversible jacket over a matching straight trouser. Light insulation for the four weeks a year that need it.'],
  ['Ila Silk Co-ord Set', 7290, 9490, 4.8, 46, null, 'Silk', ['Wine', 'Emerald', 'Black'], ['Party', 'Festive'],
    'A silk camisole and fluid trouser in one continuous colour. Reads as a dress from across a room, moves far better.'],
];

/* =========================== JEWELLERY (10) ============================== */
const JEWELLERY = [
  ['Chandni Oxidised Jhumkas', 1290, 1690, 4.8, 243, 'Bestseller', 'Metal', ['Silver'], ['Festive', 'Everyday'],
    'Hand-finished oxidised brass jhumkas with a fine ghungroo fringe. Light enough on the ear to forget you have them on.'],
  ['Roshni Pearl Drop Earrings', 1590, 2090, 4.7, 168, null, 'Metal', ['Ivory', 'Gold'], ['Wedding', 'Office Wear'],
    'Freshwater pearls suspended from a slim gold-plated hoop. A single detail, done properly.'],
  ['Anokhi Kundan Choker', 3490, 4490, 4.8, 91, null, 'Metal', ['Gold', 'Emerald'], ['Wedding', 'Festive'],
    'Uncut-stone kundan set in gold-plated brass with a hand-knotted silk adjuster at the back. Sits high on the collarbone.'],
  ['Kanti Temple Coin Necklace', 2790, 3590, 4.6, 76, null, 'Metal', ['Gold', 'Maroon'], ['Festive', 'Wedding'],
    'A South Indian kasumalai of struck coins on a fine chain. Substantial without ever feeling heavy through a long evening.'],
  ['Mitra Stacking Bangles Set', 1890, 2490, 4.7, 134, null, 'Metal', ['Gold', 'Silver'], ['Everyday', 'Festive'],
    'A set of six graduated bangles, three hammered and three smooth, meant to be stacked and rearranged endlessly.'],
  ['Sitara Statement Ring', 1190, 1590, 4.5, 112, null, 'Metal', ['Silver', 'Teal'], ['Party', 'Everyday'],
    'An oversized oxidised silver ring set with a single cabochon stone. Adjustable band, so sizing is never a problem.'],
  ['Nira Silver Anklets', 1690, 2190, 4.6, 88, null, 'Metal', ['Silver'], ['Festive', 'Everyday'],
    'A pair of 92.5 sterling payals with tiny bells and a secure hook clasp. Sold as a pair, as they should be.'],
  ['Aabha Maang Tikka', 2290, 2990, 4.7, 54, 'New', 'Metal', ['Gold', 'Rose Pink'], ['Wedding', 'Festive'],
    'A delicate single-strand tikka with a pearl drop and a woven hair hook that actually stays put.'],
  ['Riya Layered Chain Necklace', 1990, 2590, 4.5, 129, null, 'Metal', ['Gold', 'Silver'], ['Everyday', 'Office Wear'],
    'Three chains of different gauges on a single clasp, so the layering never tangles. Wears well with a high neckline.'],
  ['Zari Enamel Studs', 890, 1190, 4.6, 201, 'Bestseller', 'Metal', ['Teal', 'Maroon', 'Mustard'], ['Everyday', 'Office Wear'],
    'Hand-painted meenakari enamel on small gold-plated studs. The everyday earring you stop taking off.'],
];

/* ========================== ACCESSORIES (10) ============================= */
const ACCESSORIES = [
  ['Anvi Woven Jute Tote', 2290, 2990, 4.6, 118, 'Bestseller', 'Jute', ['Beige', 'Indigo'], ['Everyday', 'Vacation'],
    'A generously sized handwoven jute tote with a cotton lining and an inner zip pocket. Holds a laptop, a water bottle and a folded saree.'],
  ['Suri Silk Potli Bag', 1890, 2490, 4.7, 84, null, 'Silk', ['Maroon', 'Gold', 'Emerald'], ['Wedding', 'Festive'],
    'A drawstring potli in raw silk with a hand-tasselled base and a concealed inner pocket for the essentials.'],
  ['Meera Embroidered Sling Bag', 2690, 3490, 4.5, 71, 'New', 'Cotton', ['Rust', 'Ivory', 'Teal'], ['Everyday', 'Vacation'],
    'A compact sling with mirror-work embroidery across the flap and an adjustable webbing strap.'],
  ['Nazm Printed Silk Scarf', 1490, 1990, 4.6, 96, null, 'Silk', ['Lavender', 'Coral', 'Charcoal'], ['Office Wear', 'Everyday'],
    'A square silk scarf with hand-rolled edges, printed in a small archival motif. Wear it at the neck, the wrist or the bag handle.'],
  ['Rani Hand-Block Dupatta', 1990, 2590, 4.7, 143, null, 'Cotton', ['Indigo', 'Mustard', 'Off White'], ['Everyday', 'Festive'],
    'Two and a half metres of hand-blocked mulmul with a hand-knotted tassel fringe. The fastest way to finish a plain kurta.'],
  ['Bandhani Scrunchie Set', 690, 890, 4.5, 176, null, 'Cotton', ['Rose Pink', 'Teal', 'Mustard'], ['Everyday', 'Vacation'],
    'A set of three tie-dyed cotton scrunchies with a soft covered elastic that holds without pulling.'],
  ['Kaira Leather Belt', 1790, 2290, 4.4, 63, null, 'Leather', ['Beige', 'Charcoal', 'Rust'], ['Office Wear', 'Everyday'],
    'A slim vegetable-tanned leather belt with a brushed brass buckle. Cinch it over a saree, a shirt dress or a kurta.'],
  ['Juhi Beaded Clutch', 3190, 4090, 4.7, 57, null, 'Metal', ['Silver', 'Gold', 'Black'], ['Party', 'Wedding'],
    'Hand-beaded across a rigid frame with a detachable chain. Fits a phone, a card holder and very little else, by design.'],
  ['Saanjh Gift Box', 2990, 3690, 4.8, 42, 'New', 'Cotton', ['Ivory', 'Gold'], ['Festive', 'Wedding'],
    'A curated box holding a mulmul dupatta, a pair of enamel studs and a hand-poured candle, wrapped in block-printed paper.'],
  ['Padma Cotton Stole', 1590, 2090, 4.5, 108, null, 'Handloom', ['Off White', 'Olive', 'Sky'], ['Office Wear', 'Vacation'],
    'A lightweight handloom stole with a fine stripe and a knotted fringe. Lives permanently in an overstuffed bag.'],
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

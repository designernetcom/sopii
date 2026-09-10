/**
 * Content pages (Our Story, FAQ, Shipping, …).
 * Each is a title, an intro and a list of sections — rendered by StaticPage.
 * `faq: true` renders the sections as an accordion instead of prose.
 */

export const STATIC_PAGES = {
  'our-story': {
    title: 'Our Story',
    eyebrow: 'About SOPII',
    intro:
      'SOPII began in 2021 with one saree, one weaver and a stubborn belief that Indian textiles deserve better than a novelty shelf in a department store.',
    seed: 901,
    tags: 'textile',
    sections: [
      {
        heading: 'Where it started',
        body: 'Our founder spent two years travelling between weaving clusters in Kutch, Maheshwar, Chanderi and Kanchipuram, buying directly from the families at the loom. The first collection was forty sarees, photographed on a friend’s terrace in Bandra, and it sold out in nine days.',
      },
      {
        heading: 'What we make',
        body: 'Sarees, blouses and ready-to-wear built around natural fibres — cotton, silk, linen and blends of the three. Nothing synthetic, nothing designed to last a single season. We would rather sell you one piece you wear for ten years than ten you wear once.',
      },
      {
        heading: 'Who makes it',
        body: 'We work with eleven weaving clusters across five states and two stitching units in Mumbai. Every weaver is paid a per-piece rate agreed in advance, and we publish the split between craft cost and retail price on request.',
      },
      {
        heading: 'Where we are going',
        body: 'Our next chapter is about scale without dilution: more looms, the same standards, and a repair service so a SOPII saree can be re-worn rather than replaced.',
      },
    ],
  },

  'our-craft': {
    title: 'Our Craft',
    eyebrow: 'About SOPII',
    intro:
      'Every technique we work with predates the company by several centuries. Our job is to keep it commercially viable, not to reinvent it.',
    seed: 902,
    tags: 'textile',
    sections: [
      {
        heading: 'Handloom',
        body: 'A pit loom produces roughly one saree every three to nine days depending on the count and the motif density. The slight irregularities in the weave are how you tell it apart from a power loom — they are the point, not a defect.',
      },
      {
        heading: 'Hand-block printing',
        body: 'Carved teak blocks, natural dyes and a printer working down a forty-foot table by eye. Each colour is a separate pass. A small shift in registration between repeats is the signature of the hand.',
      },
      {
        heading: 'Ikat and Jamdani',
        body: 'In ikat, the yarn is resist-dyed before weaving, so the pattern emerges only as the cloth is made. In Jamdani, motifs are floated into the weave with a fine bamboo needle — a metre can take a week.',
      },
      {
        heading: 'Zardozi and hand embroidery',
        body: 'Our embroidery is worked on an adda frame by karigars in Mumbai and Lucknow. You can always check the reverse of a SOPII blouse: hand-work looks deliberate from the back, machine-work does not.',
      },
    ],
  },

  sustainability: {
    title: 'Sustainability',
    eyebrow: 'About SOPII',
    intro:
      'We are not a carbon-neutral company and we are not going to claim to be one. Here is what we actually do, and what we have not solved yet.',
    seed: 903,
    tags: 'cotton',
    sections: [
      {
        heading: 'Natural fibres, small batches',
        body: 'Everything we sell is cotton, silk, linen or a blend. We produce in runs of 30–120 pieces and reorder only what sells, which keeps deadstock in the low single digits.',
      },
      {
        heading: 'Low-impact dyeing',
        body: 'Around 60% of our printed cotton uses vegetable and mineral dyes. The remainder uses azo-free reactive dyes, because natural dyes cannot yet hit certain colours with the fastness our customers expect.',
      },
      {
        heading: 'Packaging',
        body: 'Orders ship in recycled kraft boxes with paper tape and a reusable cotton bag. No plastic polybags anywhere in the chain since March 2024.',
      },
      {
        heading: 'What we have not solved',
        body: 'Return shipping is carbon-intensive and we have not offset it. Our silk is not peace silk. We would rather say so plainly than round it up in a report.',
      },
    ],
  },

  careers: {
    title: 'Careers',
    eyebrow: 'About SOPII',
    intro:
      'A small team in Pune, doing a lot. If you like ownership over process, you will like it here.',
    seed: 904,
    tags: 'fashion',
    sections: [
      {
        heading: 'Open roles',
        body: 'Textile Sourcing Associate (Pune) · Frontend Engineer (Remote, India) · Customer Experience Lead (Mumbai) · Studio Photographer (Contract).',
      },
      {
        heading: 'How we hire',
        body: 'One conversation about your work, one practical exercise paid at market rate, one conversation with the team you would join. No unpaid assignments, no more than three rounds, always a decision within ten days.',
      },
      {
        heading: 'Apply',
        body: 'Write to careers@sopiistore.com with the role in the subject line and anything you have made. A portfolio, a repository or a paragraph on what you would change about this website all work.',
      },
    ],
  },

  contact: {
    title: 'Contact Us',
    eyebrow: 'Customer Care',
    intro:
      'Real people, Monday to Saturday, 10am to 7pm IST. Most emails get a reply within one working day.',
    seed: 905,
    tags: 'fashion',
    sections: [
      {
        heading: 'Customer care',
        body: 'Email care@sopiistore.com or call +91 8105292614 , +91 7972185287 for anything to do with an order, a return or sizing advice.',
      },

      {
        heading: 'Visit the studio',
        body: 'Gat.No. 606, shop No -228,2nd Floor, NEBC , Jadhavwadi, Chikhali, Pune -411062.',
      },
    ],
  },

  shipping: {
    title: 'Shipping Policy',
    eyebrow: 'Customer Care',
    intro: 'Where we ship, how long it takes and what it costs.',
    seed: 906,
    tags: 'fashion',
    sections: [
      {
        heading: 'Dispatch',
        body: 'Orders placed before 2pm IST on a working day are dispatched the same day. Everything else goes out the next working day from our Pune studio.',
      },
      {
        heading: 'Delivery times',
        body: 'Metro cities: 2–4 working days. Rest of India: 4–7 working days. Express delivery (2–3 working days) is available at checkout for ₹149.',
      },
      {
        heading: 'Shipping charges',
        body: 'Free standard shipping on orders above ₹9,999. Below that, standard shipping is ₹99. Cash on delivery is available across serviceable pin codes at no extra charge.',
      },

    ],
  },

 returns: {
  title: 'Return Policy',
  eyebrow: 'Customer Care',
  intro: 'All sales are final. We do not accept returns or exchanges.',
  seed: 907,
  tags: 'fashion',
  sections: [
    {
      heading: 'Final Sale Policy',
      body: 'To maintain strict quality control and offer the best possible pricing, every purchase is final sale. Once an order is processed, it cannot be returned, cancelled, or exchanged.',
    },
    {
      heading: 'Damaged or Wrong Items',
      body: 'If your item arrives damaged, defective, or incorrect, email care@sopiistore.com within 48 hours of delivery with photo proof and your order number. We will gladly arrange a replacement or refund for verified issues.',
    },
    {
      heading: 'Sizing & Selection',
      body: 'Because we do not offer size exchanges, we highly recommend checking our detailed size charts or contacting our team before purchasing to ensure the perfect fit.',
    },
    {
      heading: 'Refund Exceptions',
      body: 'Refunds are strictly limited to instances of damaged goods or inventory errors where a replacement is unavailable. Approved refunds take 5 working days to process back to your original payment method.',
    },
  ],
},


  'size-guide': {
    title: 'Size Guide',
    eyebrow: 'Customer Care',
    intro:
      'All measurements are body measurements in inches. Our pieces are cut with ease built in.',
    seed: 908,
    tags: 'fashion',
    sections: [
      {
        heading: 'How to measure',
        body: 'Bust: around the fullest part, keeping the tape level. Waist: at the narrowest point, usually just above the navel. Hip: around the fullest part, roughly eight inches below the waist. Measure over light clothing, not over a padded blouse.',
      },
      {
        heading: 'Blouses and ready-to-wear',
        body: 'XS fits a 32" bust, S 34", M 36", L 38", XL 40" and XXL 42". Waist runs six inches below bust and hip three inches above. If you are between sizes, size up — our blouses have limited seam allowance.',
      },
      {
        heading: 'Sarees and dupattas',
        body: 'Sarees are free size at 5.5 metres plus a 0.8 metre blouse piece where mentioned. Dupattas are 2.5 metres. Both are cut generously enough for any drape style.',
      },
      {
        heading: 'Still unsure?',
        body: 'Send us your measurements at care@sopiistore.com and we will tell you which size to take — including when the honest answer is that a piece will not fit well.',
      },
    ],
  },

  faq: {
    title: 'Frequently Asked Questions',
    eyebrow: 'Customer Care',
    intro: 'The questions we get most often, answered properly.',
    seed: 909,
    tags: 'fashion',
    faq: true,
    sections: [
      {
        heading: 'Do your sarees come with a blouse?',
        body: 'Most sarees include an unstitched blouse piece of 0.8 metres, mentioned in the product details. Stitched blouses are sold separately in the Blouses section.',
      },
      {
        heading: 'Will the colour match the photographs?',
        body: 'Every product is photographed in daylight with minimal retouching. Screens vary, so expect a small shift. If a piece arrives noticeably different from its listing, return it and tell us — we will fix the photograph.',
      },
      {
        heading: 'Is the handloom genuine?',
        body: 'Yes. Anything labelled handloom, Jamdani, Chanderi, ikat or Kalamkari is made by hand at the cluster named in the product details. Where a piece is a cotton-silk blend or power-loom base, we say so in the fabric field.',
      },
      {
        heading: 'How should I wash a handloom saree?',
        body: 'Dry clean the first time, then gentle cold hand wash separately. Do not wring. Dry in shade, and iron on the reverse. Fabric and care instructions specific to each piece are on every product page.',
      },
      {
        heading: 'Do you offer cash on delivery?',
        body: 'Yes, across all serviceable pin codes in India, at no extra charge. Orders above ₹15,000 require prepayment.',
      },
      {
        heading: 'Can I change or cancel an order?',
        body: 'Yes, as long as it has not been dispatched. Email care@sopiistore.com with your order number as soon as you can and we will stop it at the studio.',
      },
      {
        heading: 'Do you restock sold-out pieces?',
        body: 'Sometimes. Handloom runs depend on the weaver’s calendar, so a restock can take six to ten weeks — and some pieces never come back. Signature pieces are always restocked.',
      },
    ],
  },

  'privacy-policy': {
    title: 'Privacy Policy',
    eyebrow: 'Legal',
    intro:
      'This is a demonstration storefront. There are no analytics and no third-party trackers, and no payment details are ever collected.',
    seed: 910,
    tags: 'fashion',
    sections: [
      {
        heading: 'What stays in your browser',
        body: 'Your bag, wishlist, recently viewed products and recent searches are kept in this browser’s localStorage and are never sent anywhere. Clearing your browser storage for this site removes them instantly and permanently.',
      },
      {
        heading: 'What reaches our server',
        body: 'If you create an account we store your name, email address, phone number and any delivery addresses you save, so that we can show you your orders. Placing an order sends us that order — what you bought, where it is going and how you chose to pay. Signing up to the newsletter stores your email address. Nothing else leaves your browser.',
      },
      {
        heading: 'What we never collect',
        body: 'No card, UPI or bank details are collected anywhere on this site — no payment is processed at all. We do not track you across other sites.',
      },
      {
        heading: 'Getting your data removed',
        body: 'Write to us and we will delete your account, its addresses and its order history.',
      },
      {
        heading: 'Third parties',
        body: 'Product imagery is loaded from a public placeholder image service and fonts from Google Fonts. Those requests are subject to their own privacy policies.',
      },
    ],
  },

  terms: {
    title: 'Terms & Conditions',
    eyebrow: 'Legal',
    intro: 'The short version: this is a portfolio build, not a shop.',
    seed: 911,
    tags: 'fashion',
    sections: [
      {
        heading: 'No real transactions',
        body: 'No payment is processed, no card details are collected and no order will ever be shipped. Every product, price, review and order number on this site is fictional.',
      },
      {
        heading: 'Content',
        body: 'All copy and branding here are original to SOPII. Product photography is placeholder imagery supplied by a third-party service and is not owned by SOPII.',
      },
      {
        heading: 'Availability',
        body: 'The site is provided as-is, with no guarantee of uptime, accuracy or fitness for any particular purpose.',
      },
    ],
  },
};

export const getStaticPage = (slug) => STATIC_PAGES[slug];

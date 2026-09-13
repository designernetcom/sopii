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
    'SOPII was born from a shared love for sarees, Indian craftsmanship and the timeless beauty of Indian textiles — created by Sonika and Priyanka after they chose to leave their corporate careers and take a leap into entrepreneurship.',

  

  seed: 901,
  tags: 'textile',

sections: [
  {
    heading: 'Our Tagline',
    body: 'Elegance in Every Drape.',
  },

  {
    heading: 'Year Established',
    body: '2026',
  },


  {
    heading: 'From Corporate Careers to Entrepreneurship',
    body:
      'Sonika was a Manager at Citi Bank, and Priyanka was a SAP Consultant at IBM. After years of building their careers in the corporate world, they decided to leave their established careers and take a leap into entrepreneurship. Their decision was driven by a desire to build something of their own — something that reflected their passion, creativity and vision.',
  },

  {
    heading: 'The Story Behind SOPII',
    body:
      'SOPII was born from a simple idea — to create something of their own around their shared love for sarees and the timeless beauty of Indian textiles. Their love for sarees, fabrics, colours, craftsmanship and Indian traditions inspired them to create a brand that celebrates the saree in all its beauty.',
  },

  {
    heading: 'The Name SOPII',
    body:
      'The name SOPII was thoughtfully created from Sonika and Priyanka, giving the brand a personal identity and representing the beginning of their entrepreneurial journey.',
  },

  
  {
    heading: 'Brand Essence',
    body:
      'SOPII stands for Timeless elegance, Indian craftsmanship, Authentic textiles, Contemporary style, Individuality, and Quality and thoughtful curation.',
  },

  {
    heading: 'More Than Just a Saree Store',
    body:
      'SOPII is more than just a saree store. It is a celebration of Indian craftsmanship, timeless traditions and contemporary elegance — bringing thoughtfully selected sarees to women who appreciate authenticity, beauty and individuality.',
  },

  {
    heading: 'Our Mission',
    body:
      'To celebrate the timeless beauty of Indian sarees by bringing together traditional craftsmanship, quality textiles and contemporary elegance, while making sarees relevant and accessible to the modern woman.',
  },

  {
    heading: 'Our Vision',
    body:
      "To build SOPII into a trusted and loved saree brand that celebrates India's rich textile heritage and inspires women to embrace the saree with confidence, elegance and individuality.",
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
  title: 'Shipping & Delivery Policy',
  eyebrow: 'Customer Care',
  intro: 'We are committed to delivering your order within the promised time frame through reputed courier agencies.',
  seed: 906,
  tags: 'fashion',
  sections: [
    {
      heading: 'Shipping & Delivery',
      body: 'We are committed to deliver your order within the promised time frame. We ship through reputed courier agencies only. If there is no courier service available in your area, contact us on the details provided on the Contact Us page.',
    },
    {
      heading: 'Damaged or Tampered Packages',
      body: 'If the product you received appears to be in a bad condition or if the packaging is tampered with or damaged before delivery, please refuse to accept the package and return the package to the delivery person. Please contact us on the details provided on the Contact Us page.',
    },
    {
      heading: 'Delivery Schedule',
      body: 'Within Pune: 4–5 working days. Within Maharashtra: 5–6 working days. All Over India: 8–10 working days.',
    },
    {
      heading: 'International Shipping',
      body: 'International Shipping is available to select countries. International orders may require 3–5 additional working days in terms of processing and delivery time. Any import taxes, duties, or fees payable upon delivery are the sole responsibility of the receiving customer.',
    },
    {
      heading: 'International Order Charges',
      body: 'The price reflected on the website is exclusive of transaction fee, conversion fee, and shipping charges. The final price paid by the customer, which will reflect in the Invoice, will be the price after adding a 10% transaction fee and conversion fee and shipping charges depending on the order value and dimensions of your order.',
    },
    {
      heading: 'Order Delivery Timeline',
      body: 'Orders are delivered within 12 to 15 working days, unless otherwise specifically mentioned in the product details.',
    },
    {
      heading: 'Delivery Address & Modifications',
      body: 'Delivery of all orders will be duly done to the address as mentioned by you at the time of placing the order. In case of modifications, kindly drop us a mail at supportsopii@gmail.com within 2 hours of placing the order. For placing an International order, contact us on the details provided on the Contact Us page.',
    },
    {
      heading: 'USA Shipping Policy – Additional Tariff Charges',
      body: 'For USA orders only: As per the recent tariff regulations imposed by the US Government, all shipments to the United States will incur an additional cost. The cost may vary from 40% to 100% of the final shipping amount.',
    },
    {
      heading: 'USA Import Taxes',
      body: 'Whatever the total value of the shipment, an extra 40%–100% may be levied as taxes at the time of import. Customers are requested to kindly take this into consideration while placing their orders.',
    },
    {
      heading: 'Shipping Partners & Delivery Delays',
      body: 'We have partnered with reputed shipping companies like FedEx, Blue Dart, and DHL in order to maintain the safety and timely delivery of your product. However, we are not accountable for any delay in delivery of your product by the shipping companies.',
    },
  ],
},




returns: {
  title: 'Return and Exchange',
  eyebrow: 'Customer Care',
  intro: 'Our products are thoroughly checked before dispatch and are of the highest quality standards. Products cannot be returned after purchase for a refund.',
  seed: 907,
  tags: 'fashion',
  sections: [
    {
      heading: 'Return and Exchange',
      body: 'All our products are thoroughly checked before dispatch and are of the highest quality standards. Due to the nature of our business and the uniqueness of the products we sell, our products cannot be returned after purchase for a refund.',
    },
    {
      heading: 'Defective Products',
      body: 'If you receive a defective product, you can contact us for an exchange. You can raise an exchange request at supportsopii@gmail.com within 48 hours of receiving the product.',
    },
    {
      heading: 'How to Raise an Exchange Request',
      body: 'Please mention your order number and attach an image of the product when raising the exchange request. You will receive an approval email from us if your exchange request is accepted.',
    },
    {
      heading: 'Exchange Request Timeline',
      body: 'No exchange request will be accepted if the exchange request is raised after 48 hours of receiving the shipment.',
    },
    {
      heading: 'Product Condition',
      body: 'The products you wish to exchange should be unused and unwashed for hygiene reasons.',
    },
    {
      heading: 'Saree Exchange Policy',
      body: 'In case of sarees with fall and/or pico done, exchange requests will not be accepted.',
    },
    {
      heading: 'Original Packaging and Tags',
      body: 'Make sure that the original packaging is not tampered with and that the price tags are in place.',
    },
    {
      heading: 'Exchange Availability',
      body: 'An exchange will be carried out depending on the stock availability.',
    },
    {
      heading: 'Contact Us',
      body: 'If you need more clarity or have any more questions, please feel free to get in touch with us at supportsopii@gmail.com.',
    },
  ],
},


refund: {
  title: 'Refund Policy',
  eyebrow: 'Customer Care',
  intro: 'All our products are thoroughly checked before dispatch. Due to the nature and uniqueness of our products, purchases cannot be returned for a refund.',
  seed: 908,
  tags: 'fashion',
  sections: [
    {
      heading: 'Refund Policy',
      body: 'All our products are thoroughly checked before dispatch and are of the highest quality standards. Due to the nature of our business and the uniqueness of the products we sell, our products cannot be returned after purchase for a refund.',
    },
    {
      heading: 'Defective Products',
      body: 'If you receive a defective product, you can contact us for an exchange. You can raise an exchange request at supportsopii@gmail.com within 48 hours of receiving the product.',
    },
    {
      heading: 'How to Raise an Exchange Request',
      body: 'Please mention your order number and attach an image of the product when raising the exchange request. You will receive an approval email from us if your exchange request is accepted.',
    },
    {
      heading: 'Exchange Request Timeline',
      body: 'No exchange request will be accepted if the exchange request is raised after 48 hours of receiving the shipment.',
    },
    {
      heading: 'Product Condition',
      body: 'The products you wish to exchange should be unused and unwashed for hygiene reasons.',
    },
    {
      heading: 'Saree Exchange Policy',
      body: 'In case of sarees with fall and/or pico done, exchange requests will not be accepted.',
    },
    {
      heading: 'Original Packaging and Tags',
      body: 'Make sure that the original packaging is not tampered with and that the price tags are in place.',
    },
    {
      heading: 'Exchange Availability',
      body: 'An exchange will be carried out depending on the stock availability.',
    },
    {
      heading: 'Contact Us',
      body: 'If you need more clarity or have any more questions, please feel free to get in touch with us at supportsopii@gmail.com.',
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

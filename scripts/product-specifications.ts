// Fills Product.specifications for the demo catalog. Idempotent: re-running overwrites with the same
// values. Run with: npm run products:specs   (add -- --dry to validate without writing).
import { config } from "dotenv";
config({ path: ".env.local" });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

type Spec = [label: string, value: string];

const SPECS: Record<string, Spec[]> = {
  // ---- Beauty & Health ----
  "argan-oil-hair-mask": [
    ["Volume", "250 ml"],
    ["Hair type", "Dry and damaged"],
    ["Key ingredient", "Cold-pressed argan oil"],
    ["Usage", "Apply to damp hair, leave on 5–10 minutes, rinse thoroughly"],
    ["Recommended frequency", "1–2 times per week"],
    ["Packaging", "Recyclable tub with screw lid"],
    ["Shelf life after opening", "12 months"],
  ],
  "charcoal-face-mask-set": [
    ["Quantity", "5 single-use packs"],
    ["Net weight per pack", "15 g"],
    ["Skin type", "Oily and combination"],
    ["Main ingredients", "Activated charcoal, kaolin clay"],
    ["Usage", "Apply for 10–15 minutes, rinse with warm water"],
    ["Recommended frequency", "Once a week"],
    ["Packaging", "Individually sealed sachets"],
  ],
  "digital-bathroom-scale": [
    ["Maximum capacity", "180 kg"],
    ["Precision", "100 g"],
    ["Measurements", "Weight, body fat, body water, muscle mass"],
    ["Connectivity", "Bluetooth 5.0"],
    ["Companion app", "iOS and Android"],
    ["User profiles", "Up to 8"],
    ["Platform", "Tempered glass"],
    ["Dimensions", "30 × 30 × 2.5 cm"],
    ["Power", "3 × AAA batteries (included)"],
  ],

  // ---- Books ----
  "clean-code": [
    ["Author", "Robert C. Martin"],
    ["Publisher", "Prentice Hall"],
    ["Language", "English"],
    ["Format", "Paperback"],
    ["Pages", "464"],
    ["ISBN", "978-0132350884"],
    ["First published", "2008"],
  ],
  "sapiens-a-brief-history-of-humankind": [
    ["Author", "Yuval Noah Harari"],
    ["Publisher", "Harper"],
    ["Language", "English"],
    ["Original language", "Hebrew"],
    ["Format", "Paperback"],
    ["Pages", "464"],
    ["ISBN", "978-0062316110"],
    ["First published", "2011 (Hebrew), 2014 (English)"],
  ],
  "the-midnight-library": [
    ["Author", "Matt Haig"],
    ["Publisher", "Canongate"],
    ["Language", "English"],
    ["Format", "Paperback"],
    ["Pages", "304"],
    ["ISBN", "978-1786892737"],
    ["First published", "2020"],
  ],

  // ---- Electronics ----
  "20000mah-power-bank": [
    ["Capacity", "20,000 mAh (74 Wh)"],
    ["Ports", "2 × USB-C PD, 1 × USB-A"],
    ["Maximum output", "65 W (USB-C PD)"],
    ["Fast-charge protocols", "USB Power Delivery 3.0, Quick Charge 3.0"],
    ["Input", "USB-C, up to 65 W"],
    ["Full recharge time", "Approx. 2.5 hours"],
    ["Protections", "Over-charge, over-current, short-circuit, over-temperature"],
    ["Dimensions", "15.5 × 7.2 × 2.9 cm"],
    ["Weight", "480 g"],
    ["Air travel", "Under the 100 Wh cabin-baggage limit"],
  ],
  "fitness-smartwatch": [
    ["Display", "1.4\" AMOLED, 454 × 454 px"],
    ["Health sensors", "Optical heart rate, SpO2, skin temperature"],
    ["Tracking", "Sleep, steps, calories, 20+ sport modes"],
    ["Battery life", "Up to 10 days typical use"],
    ["Charging", "Magnetic charger, approx. 2 hours"],
    ["Water resistance", "5 ATM"],
    ["Connectivity", "Bluetooth 5.2"],
    ["Compatibility", "Android 8+ and iOS 13+"],
    ["Case size", "46 mm"],
    ["Weight", "42 g (without strap)"],
  ],
  laptop: [
    ["Display", "15.6\" Full HD (1920 × 1080), IPS, anti-glare"],
    ["Processor", "8-core, up to 4.4 GHz"],
    ["Memory (RAM)", "16 GB DDR4"],
    ["Storage", "512 GB NVMe SSD"],
    ["Graphics", "Integrated"],
    ["Battery life", "Up to 8 hours"],
    ["Ports", "2 × USB-A, 1 × USB-C, HDMI, 3.5 mm audio"],
    ["Connectivity", "Wi-Fi 6, Bluetooth 5.1"],
    ["Operating system", "Windows 11 Home"],
    ["Weight", "1.8 kg"],
  ],
  "laptop-2": [
    ["Display", "15.6\" Full HD (1920 × 1080), IPS, anti-glare"],
    ["Processor", "8-core, up to 4.4 GHz"],
    ["Memory (RAM)", "16 GB DDR4"],
    ["Storage", "512 GB NVMe SSD"],
    ["Graphics", "Integrated"],
    ["Battery life", "Up to 8 hours"],
    ["Ports", "2 × USB-A, 1 × USB-C, HDMI, 3.5 mm audio"],
    ["Connectivity", "Wi-Fi 6, Bluetooth 5.1"],
    ["Operating system", "Windows 11 Home"],
    ["Weight", "1.8 kg"],
  ],
  "mechanical-keyboard": [
    ["Layout", "87-key tenkeyless, US ANSI"],
    ["Switches", "Hot-swappable mechanical (3- and 5-pin compatible)"],
    ["Backlight", "Per-key RGB"],
    ["Keycaps", "Double-shot PBT"],
    ["Connection", "Wired, USB-C (detachable cable)"],
    ["Cable length", "1.8 m"],
    ["Polling rate", "1000 Hz"],
    ["Key rollover", "N-key rollover"],
    ["Dimensions", "36 × 13.5 × 4 cm"],
    ["Weight", "850 g"],
  ],
  "portable-bluetooth-speaker": [
    ["Sound", "360° omnidirectional"],
    ["Output power", "20 W RMS"],
    ["Drivers", "2 × full-range, 2 × passive radiators"],
    ["Battery", "5,200 mAh"],
    ["Playtime", "Up to 12 hours"],
    ["Charging", "USB-C, approx. 3.5 hours"],
    ["Water resistance", "IPX7 (waterproof)"],
    ["Bluetooth", "5.3, range approx. 30 m"],
    ["Extras", "Built-in microphone, speakerphone, stereo pairing"],
    ["Weight", "640 g"],
  ],
  "wireless-earbuds-pro": [
    ["Type", "True wireless, in-ear"],
    ["Noise control", "Active noise cancellation and transparency mode"],
    ["Drivers", "11 mm dynamic"],
    ["Battery life", "7 hours per charge, 30 hours with charging case"],
    ["Quick charge", "15 minutes gives about 2 hours of playback"],
    ["Bluetooth", "5.3"],
    ["Codecs", "SBC, AAC"],
    ["Microphones", "3 per earbud"],
    ["Water resistance", "IPX4"],
    ["Charging case", "USB-C"],
    ["Weight", "5.4 g per earbud"],
  ],

  // ---- Fashion & Apparel ----
  "classic-denim-jacket": [
    ["Material", "100% cotton denim"],
    ["Colour", "Mid-wash blue"],
    ["Fit", "Classic, unisex"],
    ["Sizes", "XS – XXL"],
    ["Closure", "Metal button front"],
    ["Pockets", "2 chest, 2 side"],
    ["Lining", "Unlined"],
    ["Care", "Machine wash at 30 °C, do not tumble dry"],
  ],
  "leather-crossbody-bag": [
    ["Material", "Genuine leather"],
    ["Lining", "Cotton"],
    ["Closure", "Zip"],
    ["Strap", "Adjustable, 70–130 cm"],
    ["Dimensions", "24 × 16 × 7 cm"],
    ["Compartments", "Main compartment, 1 interior zip pocket, 1 slip pocket"],
    ["Hardware", "Brushed metal"],
    ["Weight", "520 g"],
    ["Care", "Wipe with a soft dry cloth"],
  ],
  "running-sneakers": [
    ["Upper", "Breathable engineered mesh"],
    ["Midsole", "EVA foam with responsive cushioning"],
    ["Outsole", "Rubber with flex grooves"],
    ["Heel-to-toe drop", "8 mm"],
    ["Closure", "Lace-up"],
    ["Use", "Road running, gym, everyday"],
    ["Sizes", "EU 36 – 46, unisex"],
    ["Weight", "Approx. 270 g (size EU 42)"],
  ],
  "slim-fit-chino-pants": [
    ["Material", "97% cotton, 3% elastane"],
    ["Fit", "Slim, mid rise"],
    ["Closure", "Zip fly with button"],
    ["Pockets", "2 front, 2 back"],
    ["Waist sizes", "28 – 38"],
    ["Inseam", "82 cm"],
    ["Care", "Machine wash at 30 °C"],
  ],
  "wool-blend-scarf": [
    ["Material", "60% wool, 40% acrylic"],
    ["Size", "180 × 30 cm (one size)"],
    ["Colours", "Charcoal, camel, navy, grey"],
    ["Weight", "220 g"],
    ["Care", "Hand wash cold or dry clean"],
  ],

  // ---- Home & Garden ----
  "bamboo-cutting-board": [
    ["Material", "Organic bamboo"],
    ["Set contents", "3 boards (large, medium, small)"],
    ["Large board", "38 × 28 × 1.8 cm"],
    ["Medium board", "32 × 22 × 1.8 cm"],
    ["Small board", "25 × 18 × 1.8 cm"],
    ["Juice groove", "Yes"],
    ["Finish", "Food-safe mineral oil"],
    ["Care", "Hand wash only, not dishwasher safe"],
  ],
  "memory-foam-pillow-set": [
    ["Quantity", "2 pillows"],
    ["Filling", "Memory foam"],
    ["Size", "50 × 70 cm, height 12 cm"],
    ["Firmness", "Medium"],
    ["Cover", "Removable, machine washable at 30 °C"],
    ["Cover material", "Polyester and viscose blend"],
    ["Weight", "Approx. 1.1 kg each"],
  ],
  "outdoor-string-lights": [
    ["Length", "10 m"],
    ["Light source", "LED bulbs, warm white (2700 K)"],
    ["Power", "230 V plug-in, 10 W"],
    ["Weather protection", "IP65 (weatherproof)"],
    ["Cable", "Black, 1.5 m lead-in"],
    ["Connectable", "Up to 3 sets in series"],
    ["Use", "Patios, gardens, terraces"],
  ],

  // ---- Sports & Outdoors ----
  "camping-tent-2-person": [
    ["Capacity", "2 persons"],
    ["Season", "3-season"],
    ["Waterproof rating", "3000 mm fly, 5000 mm floor"],
    ["Fabric", "190T polyester, taped seams"],
    ["Poles", "Aluminium"],
    ["Pitched size", "210 × 130 × 110 cm"],
    ["Doors", "2"],
    ["Setup time", "Under 5 minutes"],
    ["Packed size", "45 × 15 cm"],
    ["Weight", "2.1 kg"],
  ],
  "foldable-bike-helmet": [
    ["Certification", "CE, EN 1078"],
    ["Type", "Collapsible urban helmet"],
    ["Size", "Adjustable, 54–60 cm"],
    ["Fit system", "Rear dial adjustment"],
    ["Ventilation", "12 vents"],
    ["Folded height", "Reduces by about 50%"],
    ["Weight", "340 g"],
    ["Use", "Commuting and city cycling"],
  ],
  "resistance-bands-set": [
    ["Quantity", "5 bands"],
    ["Resistance levels", "Approx. 4, 9, 14, 18 and 23 kg (colour-coded)"],
    ["Material", "Natural latex"],
    ["Length", "208 cm (loop)"],
    ["Included", "Door anchor, carry bag"],
    ["Use", "Strength training, stretching, rehabilitation"],
  ],
};

async function main() {
  const dry = process.argv.includes("--dry");
  const { prisma } = await import("../src/lib/prisma");
  const { specificationsSchema } = await import("../src/lib/product-specs");

  let updated = 0;
  const missingInDb: string[] = [];
  for (const [slug, pairs] of Object.entries(SPECS)) {
    const specifications = specificationsSchema.parse(pairs.map(([label, value]) => ({ label, value })));
    const product = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) {
      missingInDb.push(slug);
      continue;
    }
    if (!dry) await prisma.product.update({ where: { id: product.id }, data: { specifications } });
    updated++;
  }

  const withoutSpecs = await prisma.product.findMany({
    where: { slug: { notIn: Object.keys(SPECS) } },
    select: { slug: true },
  });

  console.log(`${dry ? "[dry run] would update" : "Updated"} ${updated} products.`);
  if (missingInDb.length) console.log("In script but not in DB:", missingInDb.join(", "));
  if (withoutSpecs.length) console.log("In DB but not in script:", withoutSpecs.map((p) => p.slug).join(", "));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

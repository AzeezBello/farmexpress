import fs from 'node:fs';
import path from 'node:path';

// Pure vector PDF generator for FarmExpress Business Model Canvas (Landscape A4: 842 x 595 pt)
const W = 842;
const H = 595;

function pdfEscape(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/₦/g, 'NGN ')
    .replace(/—/g, ' - ')
    .replace(/–/g, '-')
    .replace(/→/g, '->')
    .replace(/•/g, '-')
    .replace(/[^\x20-\x7E]/g, '');
}

function rgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

// Wrap text into lines of approx maxChars
function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

class PageCanvas {
  constructor() {
    this.ops = [];
  }

  // Top-left coordinate helper (x, y from top-left, width, height)
  rect(x, yTop, w, h, { fill, stroke, lineWidth = 1 } = {}) {
    const y = H - yTop - h;
    this.ops.push('q');
    if (lineWidth) this.ops.push(`${lineWidth.toFixed(2)} w`);
    if (fill) this.ops.push(`${rgb(fill)} rg`);
    if (stroke) this.ops.push(`${rgb(stroke)} RG`);
    const mode = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${mode}`);
    this.ops.push('Q');
  }

  line(x1, y1Top, x2, y2Top, { stroke = '#cbd5e1', lineWidth = 1 } = {}) {
    const y1 = H - y1Top;
    const y2 = H - y2Top;
    this.ops.push('q');
    this.ops.push(`${lineWidth.toFixed(2)} w ${rgb(stroke)} RG`);
    this.ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    this.ops.push('Q');
  }

  text(str, x, yTop, { font = 'F1', size = 9, color = '#0f172a' } = {}) {
    const y = H - yTop - size * 0.82;
    this.ops.push('BT');
    this.ops.push(`/${font} ${size.toFixed(1)} Tf`);
    this.ops.push(`${rgb(color)} rg`);
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
    this.ops.push(`(${pdfEscape(str)}) Tj`);
    this.ops.push('ET');
  }

  block(x, yTop, w, h, { num, title, subtitle, accent = '#15803d', bg = '#ffffff', border = '#cbd5e1', items = [] }) {
    this.rect(x, yTop, w, h, { fill: bg, stroke: border, lineWidth: 1 });
    // Top accent bar
    this.rect(x, yTop, w, 22, { fill: '#f1f5f9', stroke: border, lineWidth: 0.6 });
    // Number badge
    this.rect(x + 6, yTop + 4, 16, 14, { fill: accent });
    this.text(num, x + 9.5, yTop + 6.5, { font: 'F2', size: 7.5, color: '#ffffff' });
    // Block Title
    this.text(title.toUpperCase(), x + 27, yTop + 6.5, { font: 'F2', size: 8.5, color: '#0f172a' });
    if (subtitle) {
      this.text(subtitle, x + w - subtitle.length * 3.7 - 6, yTop + 7, { font: 'F1', size: 6.8, color: '#64748b' });
    }

    const maxChars = Math.max(18, Math.floor((w - 18) / 3.95));
    let curY = yTop + 28;
    for (const item of items) {
      if (curY > yTop + h - 10) break;
      if (item.heading) {
        this.text(item.heading, x + 8, curY, { font: 'F2', size: 7.8, color: accent });
        curY += 10.5;
      }
      if (item.bullets) {
        for (const b of item.bullets) {
          const wrapped = wrapText(b, maxChars - 3);
          wrapped.forEach((line, idx) => {
            if (curY > yTop + h - 9) return;
            if (idx === 0) {
              this.text('-', x + 8, curY, { font: 'F2', size: 7.5, color: accent });
            }
            this.text(line, x + 15, curY, { font: 'F1', size: 7.4, color: '#1e293b' });
            curY += 9.4;
          });
          curY += 1.8;
        }
      }
      curY += 2;
    }
  }

  stream() {
    return this.ops.join('\n');
  }
}

// ==================== PAGE 1: 9-BLOCK BUSINESS MODEL CANVAS ====================
const p1 = new PageCanvas();
p1.rect(0, 0, W, H, { fill: '#f8faf7' });

// Header Banner
p1.rect(20, 16, W - 40, 52, { fill: '#052e16' });
p1.rect(20, 65, W - 40, 3, { fill: '#84cc16' });
p1.text('FARMEXPRESS - BUSINESS MODEL CANVAS', 34, 26, { font: 'F2', size: 15, color: '#ffffff' });
p1.text(
  'Mobile-First Agricultural Marketplace Connecting Verified African Farmers with Diaspora Consumers & B2B Industry Buyers',
  34,
  46,
  { font: 'F1', size: 8.5, color: '#dcfce7' },
);
p1.rect(W - 195, 25, 162, 22, { fill: '#14532d' });
p1.text('React 19 | Express 5 | Neon DB | Paystack', W - 188, 32, { font: 'F2', size: 7.2, color: '#bef264' });

// Grid Geometry
const gx = 20;
const gy = 76;
const gw = W - 40; // 802
const colW = gw / 5; // 160.4
const topH = 340;
const halfH = topH / 2; // 170
const botY = gy + topH; // 416
const botH = 148;
const halfW = gw / 2; // 401

// 1. Key Partners
p1.block(gx, gy, colW, topH, {
  num: '1',
  title: 'Key Partners',
  accent: '#15803d',
  items: [
    {
      heading: 'Agricultural Supply Partners',
      bullets: [
        'Verified smallholder & commercial farms across Oyo, Ogun, Kaduna, Kano, Benue & Ondo.',
        'Regional farming cooperatives & produce aggregation associations.',
      ],
    },
    {
      heading: 'Logistics & Fulfillment',
      bullets: [
        '3PL carriers: FarmExpress Logistics, GIG Logistics, DHL Express, Kwik & local riders.',
        'Regional pickup hub operators for click-and-collect fulfilment.',
      ],
    },
    {
      heading: 'Financial & Tech Infrastructure',
      bullets: [
        'Paystack: card, bank transfer, USSD checkout, HMAC webhooks & automated API refunds.',
        'Vercel & Neon Serverless PostgreSQL for elastic cloud hosting & data integrity.',
      ],
    },
  ],
});

// 2. Key Activities
p1.block(gx + colW, gy, colW, halfH, {
  num: '2',
  title: 'Key Activities',
  accent: '#0369a1',
  items: [
    {
      bullets: [
        'Farmer & Business KYC Verification (CAC, National ID, Farm Permit, Tax ID review).',
        'Atomic stock reservation at checkout to prevent concurrent overselling.',
        'End-to-end order lifecycle management (PENDING -> PAID -> CONFIRMED -> SHIPPED -> DELIVERED).',
        'Multi-farm order consolidation & last-mile delivery tracking.',
        'Automated stale-order expiry (24h TTL) & Paystack refunds.',
      ],
    },
  ],
});

// 3. Key Resources
p1.block(gx + colW, gy + halfH, colW, halfH, {
  num: '3',
  title: 'Key Resources',
  accent: '#0369a1',
  items: [
    {
      bullets: [
        'Proprietary marketplace platform (React 19 SPA, Express 5 API, Prisma 6 ORM).',
        'Database of KYC-verified African farms & graded real produce catalog.',
        'DB-backed document & product image storage with immutable caching.',
        'Admin compliance suite with full security & operational Audit Log.',
      ],
    },
  ],
});

// 4. Value Propositions (Highlighted Center Column)
p1.block(gx + colW * 2, gy, colW, topH, {
  num: '4',
  title: 'Value Propositions',
  accent: '#ea580c',
  bg: '#f0fdf4',
  border: '#86efac',
  items: [
    {
      heading: 'For Diaspora & Retail Buyers',
      bullets: [
        'Direct access to authentic, farm-fresh African staples (Plantain, Cassava, Puna Yam, Cocoa, Ginger, Maize, Tomatoes).',
        'Instant stock reservation, transparent NGN pricing & live delivery tracking.',
      ],
    },
    {
      heading: 'For Industry & Bulk Buyers',
      bullets: [
        'Verified bulk sourcing from audited farms & cooperatives for food processing and export.',
        'Reliable quantity availability with platform-coordinated multi-farm fulfilment.',
      ],
    },
    {
      heading: 'For Verified Farmers',
      bullets: [
        'Direct reach to higher-margin diaspora, urban & industrial buyers without middlemen.',
        'Simple mobile dashboard for product photos, stock control & order dispatch.',
      ],
    },
  ],
});

// 5. Customer Relationships
p1.block(gx + colW * 3, gy, colW, halfH, {
  num: '5',
  title: 'Relationships',
  accent: '#7c3aed',
  items: [
    {
      bullets: [
        'Verified farm badges & transparent KYC trust signals on every listing.',
        'Real-time in-app, email & SMS notifications at every order milestone.',
        'Verified-buyer product ratings & reviews unlocked after order delivery.',
        'Admin-backed refund guarantee & dispute resolution.',
      ],
    },
  ],
});

// 6. Channels
p1.block(gx + colW * 3, gy + halfH, colW, halfH, {
  num: '6',
  title: 'Channels',
  accent: '#7c3aed',
  items: [
    {
      bullets: [
        'Mobile-first web storefront with instant search & category filtering.',
        'Role-tailored dashboards for Buyers, Farmers & Platform Admins.',
        'Direct Home Delivery (doorstep rider dispatch) & Regional Pickup Hubs.',
        'Automated transactional alerts (In-App Notification Bell + Email/SMS webhooks).',
      ],
    },
  ],
});

// 7. Customer Segments
p1.block(gx + colW * 4, gy, colW, topH, {
  num: '7',
  title: 'Customer Segments',
  accent: '#15803d',
  items: [
    {
      heading: '1. Diaspora Buyers (BUYER)',
      bullets: [
        'Africans abroad purchasing fresh farm produce for family households or export packages.',
      ],
    },
    {
      heading: '2. Domestic Urban Buyers (BUYER)',
      bullets: [
        'Households ordering farm-fresh fruits, tubers, grains & vegetables online.',
      ],
    },
    {
      heading: '3. Industry & B2B Buyers (INDUSTRY)',
      bullets: [
        'Food processors, agro-allied manufacturers, hotels & commodity exporters ordering in bulk.',
      ],
    },
    {
      heading: '4. Verified Farmers (FARMER)',
      bullets: [
        'Smallholder & commercial farmers seeking digital storefront & guaranteed payments.',
      ],
    },
  ],
});

// 8. Cost Structure
p1.block(gx, botY, halfW, botH, {
  num: '8',
  title: 'Cost Structure',
  subtitle: 'Platform & Fulfilment Costs',
  accent: '#b91c1c',
  items: [
    {
      bullets: [
        'Payment Gateway Fees: Paystack processing (1.5% + NGN 100 per local transaction, capped at NGN 2,000) & refund handling.',
        'Logistics & Hub Operations: Last-mile carrier dispatch payouts, pickup hub management & produce quality checks.',
        'Cloud & Messaging Infrastructure: Vercel serverless compute, Neon PostgreSQL storage, Email & SMS notification webhooks.',
        'Compliance & Operations: Farmer KYC verification reviews, multi-farm order coordination & customer support.',
      ],
    },
  ],
});

// 9. Revenue Streams
p1.block(gx + halfW, botY, halfW, botH, {
  num: '9',
  title: 'Revenue Streams',
  subtitle: 'Transaction & B2B Monetization',
  accent: '#15803d',
  items: [
    {
      bullets: [
        'Marketplace Commission (Take-Rate): 8% - 12% commission on Gross Merchandise Value (GMV) of completed farm orders.',
        'B2B & Industry Bulk Fulfilment Fee: 5% - 8% aggregation and quality-assurance margin on multi-farm industrial orders.',
        'Delivery & Logistics Margin: Service fee on doorstep delivery and express cold-chain coordination.',
        'Value-Added Services (Expansion): Featured farm listings, export grading certification & working-capital financing.',
      ],
    },
  ],
});

// Footer Page 1
p1.text('FarmExpress Agricultural Marketplace  |  Business Model Canvas  |  Page 1 of 2', 20, H - 18, {
  font: 'F1',
  size: 7.5,
  color: '#64748b',
});
p1.text('Confidential - Product & Strategy Overview', W - 185, H - 18, {
  font: 'F1',
  size: 7.5,
  color: '#64748b',
});

// ==================== PAGE 2: LIFECYCLE, ROLES & UNIT ECONOMICS ====================
const p2 = new PageCanvas();
p2.rect(0, 0, W, H, { fill: '#f8faf7' });

p2.rect(20, 16, W - 40, 44, { fill: '#052e16' });
p2.rect(20, 57, W - 40, 3, { fill: '#f97316' });
p2.text('FARMEXPRESS - OPERATIONAL ARCHITECTURE & UNIT ECONOMICS', 34, 28, { font: 'F2', size: 13.5, color: '#ffffff' });
p2.text('Page 2 of 2', W - 85, 31, { font: 'F2', size: 8.5, color: '#bef264' });

// Section A: Order & Payment Lifecycle
p2.rect(20, 72, W - 40, 128, { fill: '#ffffff', stroke: '#cbd5e1', lineWidth: 1 });
p2.rect(20, 72, W - 40, 22, { fill: '#f1f5f9', stroke: '#cbd5e1', lineWidth: 0.6 });
p2.text('A. END-TO-END ORDER, FULFILMENT & PAYMENT LIFECYCLE', 30, 79, { font: 'F2', size: 9, color: '#0f172a' });

const stages = [
  ['1. PENDING', 'Buyer places order', 'Stock reserved atomically', '#fef3c7', '#b45309'],
  ['2. PAID', 'Paystack / Offline', 'Webhook + redirect verified', '#e0f2fe', '#0369a1'],
  ['3. CONFIRMED', 'Farm accepts', 'Harvest & packing started', '#e0e7ff', '#4338ca'],
  ['4. SHIPPED', 'Carrier dispatched', 'Tracking ID & ETA sent', '#f3e8ff', '#6d28d9'],
  ['5. DELIVERED', 'Buyer receives', 'Verified reviews unlocked', '#dcfce7', '#15803d'],
];

stages.forEach(([title, line1, line2, bg, fg], idx) => {
  const sx = 34 + idx * 154;
  p2.rect(sx, 104, 138, 48, { fill: bg, stroke: fg, lineWidth: 1 });
  p2.text(title, sx + 10, 112, { font: 'F2', size: 8.5, color: fg });
  p2.text(line1, sx + 10, 125, { font: 'F1', size: 7.5, color: '#1e293b' });
  p2.text(line2, sx + 10, 136, { font: 'F1', size: 7.2, color: '#475569' });
  if (idx < stages.length - 1) {
    p2.text('-->', sx + 141, 123, { font: 'F2', size: 8.5, color: '#64748b' });
  }
});

p2.text(
  'Safeguards:  (1) Unpaid PENDING orders auto-expire after 24h and restock inventory.  (2) Cancelled paid orders trigger direct Paystack API refunds with full Audit Log.',
  34,
  168,
  { font: 'F1', size: 7.8, color: '#334155' },
);
p2.text(
  'Multi-farm Orders:  Single-farm orders are fulfilled directly by the owning farmer; mixed-farm orders are coordinated by FarmExpress Operations.',
  34,
  182,
  { font: 'F1', size: 7.8, color: '#334155' },
);

// Section B: Role Capabilities Matrix & Unit Economics
const secY = 212;
const secH = 345;
const col3W = (W - 56) / 3; // ~262

p2.block(20, secY, col3W, secH, {
  num: 'B1',
  title: 'Platform Role Matrix',
  accent: '#15803d',
  items: [
    {
      heading: 'Buyer & Industry Buyer',
      bullets: [
        'Browse live produce catalog with search, category filter & pagination.',
        'Reserve stock at checkout with Home Delivery or Pickup Hub selection.',
        'Pay via Paystack hosted checkout (Card, Transfer, USSD).',
        'Track live shipment timeline & review delivered produce.',
      ],
    },
    {
      heading: 'Verified Farmer',
      bullets: [
        'Upload KYC documents (Farm Permit, CAC, National ID, TIN).',
        'Create listings with direct device photo upload & stock counts.',
        'Confirm paid orders, attach carrier tracking numbers & mark delivered.',
      ],
    },
    {
      heading: 'Superadmin (Demola Blaze)',
      bullets: [
        'Review uploaded KYC documents and approve/reject with notes.',
        'Oversee all orders, mark offline payments & issue Paystack refunds.',
        'Inspect immutable platform Audit Log & live revenue analytics.',
      ],
    },
  ],
});

p2.block(28 + col3W, secY, col3W, secH, {
  num: 'B2',
  title: 'Target Unit Economics',
  accent: '#0369a1',
  items: [
    {
      heading: 'Retail & Diaspora Basket (Sample)',
      bullets: [
        'Average Order Value (AOV): NGN 35,000',
        'Platform Take-Rate (10%): NGN 3,500',
        'Delivery Coordination Margin: NGN 1,000',
        'Paystack Processing Fee (~1.5% + NGN 100): -NGN 625',
        'Net Contribution per Order: ~NGN 3,875 (11.1% of GMV)',
      ],
    },
    {
      heading: 'Industry / B2B Bulk Order (Sample)',
      bullets: [
        'Average Bulk Order Value: NGN 450,000',
        'B2B Aggregation Fee (7%): NGN 31,500',
        'Paystack Fee (Capped at NGN 2,000): -NGN 2,000',
        'Quality & Dispatch Ops Cost: -NGN 4,500',
        'Net Contribution per B2B Order: ~NGN 25,000',
      ],
    },
    {
      heading: 'Key Operational SLAs',
      bullets: [
        'KYC Verification Review Turnaround: < 12 hours',
        'Unpaid Stock Reservation Lock (TTL): 24 hours',
        'Farm Dispatch Confirmation after Payment: < 24 hours',
      ],
    },
  ],
});

p2.block(36 + col3W * 2, secY, col3W, secH, {
  num: 'B3',
  title: 'Product Catalog & Tech Stack',
  accent: '#ea580c',
  items: [
    {
      heading: 'Core Verified Produce Categories',
      bullets: [
        'Fruits: Fresh Green & Ripe Plantain Bunches.',
        'Roots & Tubers: Fresh Cassava Tubers, Puna White Yams.',
        'Grains: Yellow Maize, Raw Fermented Cocoa Beans & Pods.',
        'Vegetables & Spices: Roma Tomatoes, Dried Red Chili, Split Ginger.',
        'Legumes: Raw Shelled West African Groundnuts.',
      ],
    },
    {
      heading: 'Production Technology Stack',
      bullets: [
        'Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4.',
        'Backend API: Node.js, Express 5, Zod 4 validation, JWT + bcrypt.',
        'Database: Neon Serverless PostgreSQL + Prisma 6 migrations.',
        'Quality & CI: Automated API test suite + GitHub Actions CI.',
        'Deployment: Full-stack Vercel (Frontend + /api serverless) & Render.',
      ],
    },
  ],
});

p2.text('FarmExpress Agricultural Marketplace  |  Business Model Canvas  |  Page 2 of 2', 20, H - 18, {
  font: 'F1',
  size: 7.5,
  color: '#64748b',
});
p2.text('Generated October 2026', W - 115, H - 18, {
  font: 'F1',
  size: 7.5,
  color: '#64748b',
});

// Assemble multi-page PDF document
function buildPdf(pages) {
  const objects = [];
  const addObj = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesRootId = addObj(''); // placeholder

  const pageIds = [];
  for (const page of pages) {
    const content = page.stream();
    const contentBytes = Buffer.byteLength(content, 'utf8');
    const contentId = addObj(`<< /Length ${contentBytes} >>\nstream\n${content}\nendstream`);
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[pagesRootId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesRootId} 0 R >>`);
  const infoId = addObj(
    `<< /Title (FarmExpress Business Model Canvas) /Author (FarmExpress) /Subject (Agricultural Marketplace Business Model Canvas) /Creator (FarmExpress) >>`,
  );

  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, idx) => {
    offsets.push(Buffer.byteLength(out, 'utf8'));
    out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(out, 'utf8');
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, 'utf8');
}

const pdfBuffer = buildPdf([p1, p2]);
const outPath = path.resolve(process.cwd(), 'FarmExpress_Business_Model_Canvas.pdf');
fs.writeFileSync(outPath, pdfBuffer);
console.log(`Generated ${outPath} (${pdfBuffer.byteLength} bytes)`);

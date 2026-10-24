import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

export const SEED_PRODUCTS = [
  {
    name: 'Fresh Plantain',
    description: 'Freshly harvested green and ripe plantain bunches from verified Oyo farms.',
    price: 6500,
    quantity: 80,
    category: 'Fruits',
    location: 'Oyo State, Nigeria',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Banane_plantain_(Musaceae).jpg?width=900',
  },
  {
    name: 'Fresh Cassava Tubers',
    description: 'Quality farm-fresh cassava roots (Manihot esculenta) suitable for garri, fufu, and industrial starch processing.',
    price: 8500,
    quantity: 120,
    category: 'Roots & Tubers',
    location: 'Ogun State, Nigeria',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Yuca_%28Manihot_esculenta%29.jpg',
  },
  {
    name: 'Yellow Maize',
    description: 'Clean, sun-dried yellow maize cobs and kernels supplied directly from northern farms.',
    price: 12000,
    quantity: 100,
    category: 'Grains',
    location: 'Kaduna State, Nigeria',
    imageUrl: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Fresh Roma Tomatoes',
    description: 'Firm, vine-ripened farm tomatoes packed in ventilated crates for local and diaspora orders.',
    price: 9500,
    quantity: 45,
    category: 'Vegetables',
    location: 'Kano State, Nigeria',
    imageUrl: 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Dried Red Chili Pepper',
    description: 'Sun-dried aromatic red chili peppers sourced directly from smallholder farmers.',
    price: 7200,
    quantity: 90,
    category: 'Spices',
    location: 'Kaduna State, Nigeria',
    imageUrl: 'https://images.unsplash.com/photo-1583663848850-46af132dc08a?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Raw Cocoa Beans & Pods',
    description: 'Export-grade Nigerian Theobroma cacao pods and fermented cocoa beans for bulk and processor orders.',
    price: 28000,
    quantity: 35,
    category: 'Grains',
    location: 'Ondo State, Nigeria',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Cacao-pod-k4636-14.jpg',
  },
  {
    name: 'Puna White Yam Tubers',
    description: 'Large, sweet Puna white yam tubers freshly harvested and cured for long shelf life.',
    price: 14500,
    quantity: 65,
    category: 'Roots & Tubers',
    location: 'Benue State, Nigeria',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yam_at_monday_market_kaduna_state_01.jpg?width=900',
  },
  {
    name: 'Fresh Split Ginger Rhizomes',
    description: 'Pungent, high-oil Nigerian ginger rhizomes ideal for culinary, beverage, and export buyers.',
    price: 11000,
    quantity: 75,
    category: 'Spices',
    location: 'Southern Kaduna, Nigeria',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Fresh_ginger_rhizome_01.jpg',
  },
  {
    name: 'Raw Shelled Groundnuts',
    description: 'Clean, sorted West African groundnuts (peanuts) ready for roasting, oil milling, or peanut paste.',
    price: 10500,
    quantity: 110,
    category: 'Legumes',
    location: 'Kano State, Nigeria',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Groundnut_%28Peanut%29.jpg',
  },
] as const;

let bootstrapPromise: Promise<void> | null = null;

export function ensureBootstrapData() {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((err) => {
      bootstrapPromise = null;
      console.warn('[bootstrap] skipped or deferred:', err instanceof Error ? err.message : err);
    });
  }
  return bootstrapPromise;
}

export async function runBootstrap() {
  const [defaultHash, superAdminHash] = await Promise.all([
    bcrypt.hash('Password123!', 12),
    bcrypt.hash('$Omerta93', 12),
  ]);

  // Superadmin requested by user: Demola Blaze (demolablaze@gmail.com / $Omerta93)
  await prisma.user.upsert({
    where: { email: 'demolablaze@gmail.com' },
    update: {
      name: 'Demola Blaze',
      role: 'ADMIN',
      kycStatus: 'APPROVED',
      passwordHash: superAdminHash,
    },
    create: {
      email: 'demolablaze@gmail.com',
      name: 'Demola Blaze',
      role: 'ADMIN',
      kycStatus: 'APPROVED',
      passwordHash: superAdminHash,
    },
  });

  const upsertDemo = (
    email: string,
    data: Omit<Parameters<typeof prisma.user.create>[0]['data'], 'email' | 'passwordHash'>,
  ) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { ...data, email, passwordHash: defaultHash },
    });

  const farmer = await upsertDemo('farmer@farmexpress.test', {
    name: 'Amina Farms',
    role: 'FARMER',
    farmLocation: 'Oyo, Nigeria',
    businessName: 'Amina Farms',
    kycStatus: 'APPROVED',
  });
  await upsertDemo('newfarmer@farmexpress.test', {
    name: 'Kwame Osei',
    role: 'FARMER',
    farmLocation: 'Kumasi, Ghana',
    kycStatus: 'PENDING',
  });
  await upsertDemo('buyer@farmexpress.test', {
    name: 'Demo Buyer',
    role: 'BUYER',
  });
  await upsertDemo('industry@farmexpress.test', {
    name: 'Lagos Foods Ltd',
    role: 'INDUSTRY',
    businessName: 'Lagos Foods Ltd',
    kycStatus: 'APPROVED',
  });
  await upsertDemo('admin@farmexpress.test', {
    name: 'FarmExpress Admin',
    role: 'ADMIN',
    kycStatus: 'APPROVED',
  });

  // Update legacy product names/images if present, and insert any missing seed products.
  const legacyCassava = await prisma.product.findFirst({ where: { farmerId: farmer.id, name: 'Cassava' } });
  if (legacyCassava) {
    await prisma.product.update({
      where: { id: legacyCassava.id },
      data: {
        name: 'Fresh Cassava Tubers',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Yuca_%28Manihot_esculenta%29.jpg',
      },
    });
  }

  for (const item of SEED_PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { farmerId: farmer.id, name: item.name },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { imageUrl: item.imageUrl, description: item.description },
      });
    } else {
      await prisma.product.create({
        data: { ...item, farmerId: farmer.id },
      });
    }
  }
}

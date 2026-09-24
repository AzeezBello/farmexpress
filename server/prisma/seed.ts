import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

async function run() {
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const upsert = (email: string, data: Omit<Parameters<typeof prisma.user.create>[0]['data'], 'email' | 'passwordHash'>) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { ...data, email, passwordHash } });

  const farmer = await upsert('farmer@farmexpress.test', { name: 'Amina Farms', role: 'FARMER', farmLocation: 'Oyo, Nigeria', businessName: 'Amina Farms', kycStatus: 'APPROVED' });
  await upsert('newfarmer@farmexpress.test', { name: 'Kwame Osei', role: 'FARMER', farmLocation: 'Kumasi, Ghana', kycStatus: 'PENDING' });
  await upsert('buyer@farmexpress.test', { name: 'Demo Buyer', role: 'BUYER' });
  await upsert('industry@farmexpress.test', { name: 'Lagos Foods Ltd', role: 'INDUSTRY', businessName: 'Lagos Foods Ltd', kycStatus: 'APPROVED' });
  await upsert('admin@farmexpress.test', { name: 'FarmExpress Admin', role: 'ADMIN', kycStatus: 'APPROVED' });

  if (await prisma.product.count()) return;
  await prisma.product.createMany({ data: [
    { name: 'Fresh Plantain', description: 'Freshly harvested plantain bunches from Oyo farms.', price: 4500, quantity: 80, category: 'Fruits', imageUrl: img('photo-1603833665858-e61d17a86224') },
    { name: 'Cassava', description: 'Quality farm-fresh cassava roots suitable for food processing.', price: 2800, quantity: 120, category: 'Roots & Tubers', imageUrl: img('photo-1592924357228-91a4daadcfea') },
    { name: 'Yellow Maize', description: 'Clean, freshly harvested yellow maize.', price: 3200, quantity: 100, category: 'Grains', imageUrl: img('photo-1551754655-cd27e38d2076') },
    { name: 'Fresh Tomatoes', description: 'Farm-fresh tomatoes packed for local and diaspora orders.', price: 9500, quantity: 45, category: 'Vegetables', imageUrl: img('photo-1546094096-0df4bcaaa337') },
    { name: 'Cocoa Beans', description: 'Quality Nigerian cocoa beans available for bulk and industry orders.', price: 28000, quantity: 35, category: 'Grains', imageUrl: img('photo-1511381939415-e44015466834') },
  ].map((p) => ({ ...p, farmerId: farmer.id, location: 'Oyo, Nigeria' })) });
}

run().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

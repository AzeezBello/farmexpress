import dotenv from 'dotenv';
import { prisma } from '../src/db.js';
import { runBootstrap } from '../src/services/bootstrap.js';

dotenv.config({ path: ['.env.local', '.env'] });
if (!process.env.DATABASE_URL) {
  const fallbackDb = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  if (fallbackDb) process.env.DATABASE_URL = fallbackDb;
}

runBootstrap()
  .then(() => console.log('Seed completed: superadmin (demolablaze@gmail.com) + demo users + real product catalog ready.'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

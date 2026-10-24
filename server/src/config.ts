import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

if (!process.env.DATABASE_URL) {
  const fallbackDb = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  if (fallbackDb) process.env.DATABASE_URL = fallbackDb;
}

function resolveJwtSecret() {
  const value = process.env.JWT_SECRET;
  if (value) return value;
  if (process.env.DATABASE_URL) {
    return createHash('sha256').update(`farmexpress:${process.env.DATABASE_URL}`).digest('hex');
  }
  throw new Error('Missing required environment variable JWT_SECRET');
}

const clientUrls = process.env.CLIENT_URL?.split(',').map((url) => url.trim()).filter(Boolean);
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

export const config = {
  jwtSecret: resolveJwtSecret(),
  port: Number(process.env.PORT || 4000),
  clientUrls,
  // Where Paystack sends buyers back after checkout.
  appUrl: (process.env.APP_URL || clientUrls?.[0] || vercelUrl || 'http://localhost:5173').replace(/\/$/, ''),
  isProduction: process.env.NODE_ENV === 'production',
  pendingOrderTtlHours: Number(process.env.PENDING_ORDER_TTL_HOURS || 24),
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    baseUrl: (process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/$/, ''),
  },
  notifications: {
    emailWebhookUrl: process.env.EMAIL_WEBHOOK_URL || '',
    smsWebhookUrl: process.env.SMS_WEBHOOK_URL || '',
  },
};

if (config.isProduction && config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
if (!(config.pendingOrderTtlHours > 0)) throw new Error('PENDING_ORDER_TTL_HOURS must be a positive number');

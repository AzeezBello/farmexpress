import 'dotenv/config';

function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value;
}

const clientUrls = process.env.CLIENT_URL?.split(',').map((url) => url.trim()).filter(Boolean);

export const config = {
  jwtSecret: required('JWT_SECRET'),
  port: Number(process.env.PORT || 4000),
  clientUrls,
  // Where Paystack sends buyers back after checkout.
  appUrl: (process.env.APP_URL || clientUrls?.[0] || 'http://localhost:5173').replace(/\/$/, ''),
  isProduction: process.env.NODE_ENV === 'production',
  pendingOrderTtlHours: Number(process.env.PENDING_ORDER_TTL_HOURS || 24),
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    baseUrl: (process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/$/, ''),
  },
};

if (config.isProduction && config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
if (!(config.pendingOrderTtlHours > 0)) throw new Error('PENDING_ORDER_TTL_HOURS must be a positive number');

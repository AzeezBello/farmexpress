import { config } from './config.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { HttpError } from './lib/http.js';
import auth from './routes/auth.js';
import products from './routes/products.js';
import orders from './routes/orders.js';
import reviews from './routes/reviews.js';
import admin from './routes/admin.js';
import payments, { type RawBodyRequest } from './routes/payments.js';
import notifications from './routes/notifications.js';
import uploads from './routes/uploads.js';
import { ensureBootstrapData } from './services/bootstrap.js';
import { expireStaleOrders } from './services/orders.js';
import { paystackEnabled } from './lib/paystack.js';

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  cors({
    origin: config.clientUrls?.length ? config.clientUrls : '*',
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Page-Size', 'X-Total-Pages'],
  }),
);
// Keep the raw body: Paystack webhook signatures are computed over the exact bytes sent.
app.use(express.json({ limit: '6mb', verify: (req, _res, buf) => { (req as RawBodyRequest).rawBody = buf; } }));
if (process.env.NODE_ENV !== 'test') {
  app.use((_req, _res, next) => {
    void ensureBootstrapData();
    next();
  });
}
app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'farmexpress-api' }));
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/orders', orders);
app.use('/api/reviews', reviews);
app.use('/api/admin', admin);
app.use('/api/payments', payments);
app.use('/api/notifications', notifications);
app.use('/api/uploads', uploads);
app.use('/api', (_, res) => res.status(404).json({ message: 'Not found' }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join('.');
    return res.status(400).json({ message: issue ? `${field ? `${field}: ` : ''}${issue.message}` : 'Invalid request', issues: err.issues });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Record already exists' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Record not found' });
  }
  if (typeof err === 'object' && err && 'type' in err && err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`FarmExpress API running on http://localhost:${config.port}`);
    if (!paystackEnabled()) console.warn('PAYSTACK_SECRET_KEY not set — online payment disabled; admins confirm payments manually.');
  });

  const expireOrders = () => expireStaleOrders(config.pendingOrderTtlHours)
    .then((n) => { if (n) console.log(`Expired ${n} unpaid order(s) older than ${config.pendingOrderTtlHours}h`); })
    .catch((e) => console.error('Order expiry failed', e));
  void expireOrders();
  setInterval(expireOrders, 10 * 60_000).unref();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await prisma.$disconnect(); process.exit(0); });
}

export default app;

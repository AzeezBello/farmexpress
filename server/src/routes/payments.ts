import { Router, type Request } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, param } from '../lib/http.js';
import { initializeTransaction, isValidSignature, paystackEnabled, verifyTransaction, type PaystackTransaction } from '../lib/paystack.js';
import { auth, roles, type AuthRequest } from '../middleware/auth.js';
import { findPaymentForTransaction, settleSuccessfulTransaction, toKobo } from '../services/payments.js';

export type RawBodyRequest = Request & { rawBody?: Buffer };
const router = Router();

function requirePaystack() {
  if (!paystackEnabled()) throw new HttpError(503, 'Online payment is not available yet. Our team will contact you with payment details.');
}

router.get('/config', (_, res) => res.json({ paystack: paystackEnabled(), pendingOrderTtlHours: config.pendingOrderTtlHours }));

router.post('/orders/:id/initialize', auth, roles('BUYER', 'INDUSTRY'), async (req: AuthRequest, res) => {
  requirePaystack();
  const order = await prisma.order.findUnique({ where: { id: param(req) }, include: { payment: true, buyer: { select: { email: true } } } });
  if (!order || order.buyerId !== req.user!.id || !order.payment) throw new HttpError(404, 'Order not found');
  if (order.status !== 'PENDING') throw new HttpError(409, order.status === 'CANCELLED' ? 'This order was cancelled. Please place a new order.' : 'This order is already paid');

  // A fresh reference per attempt: Paystack rejects re-used references.
  const reference = `FX-${order.id.slice(0, 8)}-${Date.now().toString(36)}`.toUpperCase();
  await prisma.payment.update({ where: { id: order.payment.id }, data: { reference, paymentMethod: 'PAYSTACK', status: 'PENDING' } });
  const txn = await initializeTransaction({
    email: order.buyer.email, amountKobo: toKobo(order.payment.amount), reference,
    callbackUrl: `${config.appUrl}/`, metadata: { orderId: order.id },
  });
  res.json({ authorizationUrl: txn.authorization_url, reference });
});

// Called when Paystack redirects the buyer back. The webhook may already have settled it; both paths are idempotent.
router.get('/verify/:reference', auth, async (req: AuthRequest, res) => {
  requirePaystack();
  const txn = await verifyTransaction(param(req, 'reference'));
  const payment = await findPaymentForTransaction(txn);
  if (!payment || payment.order.buyerId !== req.user!.id) throw new HttpError(404, 'Payment not found');
  if (txn.status !== 'success') return res.json({ status: txn.status, orderId: payment.orderId });
  const result = await settleSuccessfulTransaction(txn);
  res.json({ status: 'success', ...result });
});

router.post('/webhook/paystack', async (req: RawBodyRequest, res) => {
  if (!paystackEnabled()) return res.sendStatus(503);
  if (!isValidSignature(req.rawBody, req.header('x-paystack-signature'))) return res.sendStatus(401);
  const event = req.body as { event?: string; data?: PaystackTransaction };
  if (event.event === 'charge.success' && event.data) {
    try { await settleSuccessfulTransaction(event.data); }
    catch (e) {
      // Acknowledge unrecoverable events so Paystack stops retrying; they're logged for ops. Anything else → 500 and Paystack retries.
      if (e instanceof HttpError && e.status < 500) console.warn(`[payments] webhook ${event.data.reference}: ${e.message}`);
      else throw e;
    }
  }
  res.sendStatus(200);
});

export default router;

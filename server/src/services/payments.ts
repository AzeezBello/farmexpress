import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';
import { metadataOrderId, type PaystackTransaction } from '../lib/paystack.js';
import { transitionOrder } from './orders.js';

export const toKobo = (amount: Prisma.Decimal) => amount.mul(100).toDecimalPlaces(0).toNumber();

// A buyer may start checkout more than once, so the stored reference can be newer than the one paid.
// Fall back to the order id carried in the (signed/verified) transaction metadata.
export async function findPaymentForTransaction(txn: Pick<PaystackTransaction, 'reference' | 'metadata'>) {
  const byRef = await prisma.payment.findUnique({ where: { reference: txn.reference }, include: { order: true } });
  if (byRef) return byRef;
  const orderId = metadataOrderId(txn.metadata);
  return orderId ? prisma.payment.findUnique({ where: { orderId }, include: { order: true } }) : null;
}

export type SettleResult = { orderId: string; outcome: 'paid' | 'already-paid' | 'refund-due' };

// Idempotent: safe to call from both the webhook and the redirect verification, in any order.
export async function settleSuccessfulTransaction(txn: PaystackTransaction): Promise<SettleResult> {
  if (txn.status !== 'success') throw new HttpError(400, `Transaction is ${txn.status}`);
  const payment = await findPaymentForTransaction(txn);
  if (!payment) throw new HttpError(404, 'No order matches this payment');
  if (txn.currency !== payment.currency || txn.amount !== toKobo(payment.amount)) {
    console.error(`[payments] amount mismatch for order ${payment.orderId}: got ${txn.amount} ${txn.currency}, expected ${toKobo(payment.amount)} ${payment.currency}`);
    throw new HttpError(400, 'Payment amount does not match the order');
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'SUCCESSFUL' } },
      data: { status: 'SUCCESSFUL', paymentMethod: 'PAYSTACK', reference: txn.reference, transactionId: String(txn.id), channel: txn.channel ?? null, paidAt: txn.paid_at ? new Date(txn.paid_at) : new Date() },
    });
    if (!count) return { orderId: payment.orderId, outcome: 'already-paid' as const };
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    if (order.status !== 'PENDING') {
      // Money arrived for an order that was cancelled (e.g. expired mid-checkout). Record it; ops must refund.
      console.error(`[payments] order ${order.id} paid while ${order.status} — refund required (ref ${txn.reference})`);
      return { orderId: order.id, outcome: 'refund-due' as const };
    }
    await transitionOrder(tx, order.id, 'PENDING', 'PAID');
    return { orderId: order.id, outcome: 'paid' as const };
  });
}

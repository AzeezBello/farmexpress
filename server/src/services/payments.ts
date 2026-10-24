import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';
import { metadataOrderId, paystackEnabled, refundTransaction, type PaystackTransaction } from '../lib/paystack.js';
import { orderInclude } from '../routes/orders.js';
import { recordAudit } from './audit.js';
import { notifyUser } from './notifications.js';
import { cancelOrder, transitionOrder } from './orders.js';

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

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { notIn: ['SUCCESSFUL', 'REFUNDED'] } },
      data: {
        status: 'SUCCESSFUL',
        paymentMethod: 'PAYSTACK',
        reference: txn.reference,
        transactionId: String(txn.id),
        channel: txn.channel ?? null,
        paidAt: txn.paid_at ? new Date(txn.paid_at) : new Date(),
      },
    });
    if (!count) return { orderId: payment.orderId, outcome: 'already-paid' as const, buyerId: payment.order.buyerId };
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    if (order.status !== 'PENDING') {
      // Money arrived for an order that was cancelled (e.g. expired mid-checkout). Record it; ops must refund.
      console.error(`[payments] order ${order.id} paid while ${order.status} — refund required (ref ${txn.reference})`);
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          status: order.status,
          title: 'Payment received after cancellation — refund queued',
          note: `Paystack ref ${txn.reference}`,
        },
      });
      return { orderId: order.id, outcome: 'refund-due' as const, buyerId: order.buyerId };
    }
    await transitionOrder(tx, order.id, 'PENDING', 'PAID', {
      trackingNote: `Paid via Paystack (${txn.channel || 'online'})`,
      actorName: 'Paystack',
    });
    return { orderId: order.id, outcome: 'paid' as const, buyerId: order.buyerId };
  });

  if (result.outcome === 'paid') {
    await notifyUser({
      userId: result.buyerId,
      type: 'ORDER_PAID',
      title: `Payment received for #${result.orderId.slice(0, 8).toUpperCase()}`,
      body: 'Your payment is confirmed and your produce order has been sent to the farm for fulfilment.',
      orderId: result.orderId,
    });
  }

  return { orderId: result.orderId, outcome: result.outcome };
}

export async function refundOrderPayment(orderId: string, actor: { id: string; email?: string | null }, reason?: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order || !order.payment) throw new HttpError(404, 'Order not found');
  if (order.payment.status === 'REFUNDED') throw new HttpError(409, 'This order has already been refunded');
  if (order.payment.status !== 'SUCCESSFUL') throw new HttpError(409, 'Only paid orders can be refunded');
  if (!['CANCELLED', 'PAID', 'CONFIRMED'].includes(order.status)) {
    throw new HttpError(409, `Cannot refund an order in ${order.status} status`);
  }

  let refundRef = `manual-refund:${actor.id}:${Date.now()}`;
  const txnKey = order.payment.reference || order.payment.transactionId;
  if (order.payment.paymentMethod === 'PAYSTACK' && paystackEnabled() && txnKey) {
    const refund = await refundTransaction({
      transaction: txnKey,
      amountKobo: toKobo(order.payment.amount),
      merchantNote: reason || `Refund for order ${order.id}`,
    });
    refundRef = `paystack:${refund.id}`;
  }

  const cleanReason = reason?.trim() || 'Refund issued by FarmExpress admin';

  const updated = await prisma.$transaction(async (tx) => {
    if (order.status !== 'CANCELLED') {
      await cancelOrder(tx, order, `Cancelled & refunded: ${cleanReason}`, 'Admin');
    }
    await tx.payment.update({
      where: { id: order.payment!.id },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundReference: refundRef,
        refundReason: cleanReason,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        status: 'CANCELLED',
        title: 'Payment refunded',
        note: `${cleanReason} (${refundRef.startsWith('paystack:') ? 'Paystack API refund' : 'Manual refund'})`,
        actorName: 'Admin',
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'ORDER_REFUNDED',
    targetType: 'PAYMENT',
    targetId: order.payment.id,
    summary: `Refunded ₦${Number(order.payment.amount).toLocaleString()} for order #${order.id.slice(0, 8).toUpperCase()}`,
    metadata: { orderId: order.id, refundReference: refundRef, reason: cleanReason },
  });

  await notifyUser({
    userId: order.buyerId,
    type: 'ORDER_REFUNDED',
    title: `Refund processed for #${order.id.slice(0, 8).toUpperCase()}`,
    body: `A refund of ₦${Number(order.payment.amount).toLocaleString()} has been issued (${cleanReason}).`,
    orderId: order.id,
  });

  return updated;
}

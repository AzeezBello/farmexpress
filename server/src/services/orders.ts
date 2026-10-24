import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';

type Tx = Prisma.TransactionClient;

export type TrackingInput = {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingNote?: string | null;
  estimatedDelivery?: Date | null;
  location?: string | null;
  actorName?: string | null;
};

const EVENT_TITLES: Record<OrderStatus, string> = {
  PENDING: 'Order placed — stock reserved',
  PAID: 'Payment confirmed',
  CONFIRMED: 'Order confirmed by farm',
  SHIPPED: 'Order dispatched for delivery',
  DELIVERED: 'Order delivered',
  CANCELLED: 'Order cancelled and stock released',
};

// Compare-and-set so two concurrent updates can't both apply.
export async function transitionOrder(tx: Tx, orderId: string, from: OrderStatus, to: OrderStatus, tracking?: TrackingInput) {
  const now = new Date();
  const data: Prisma.OrderUpdateManyMutationInput = {
    status: to,
    ...(to === 'SHIPPED' ? { dispatchedAt: now } : {}),
    ...(to === 'DELIVERED' ? { deliveredAt: now } : {}),
    ...(tracking?.carrier !== undefined ? { carrier: tracking.carrier } : {}),
    ...(tracking?.trackingNumber !== undefined ? { trackingNumber: tracking.trackingNumber } : {}),
    ...(tracking?.trackingNote !== undefined ? { trackingNote: tracking.trackingNote } : {}),
    ...(tracking?.estimatedDelivery !== undefined ? { estimatedDelivery: tracking.estimatedDelivery } : {}),
  };
  const { count } = await tx.order.updateMany({ where: { id: orderId, status: from }, data });
  if (!count) throw new HttpError(409, 'Order was updated by someone else. Refresh and try again.');

  const noteParts = [
    tracking?.carrier && `Carrier: ${tracking.carrier}`,
    tracking?.trackingNumber && `Tracking: ${tracking.trackingNumber}`,
    tracking?.trackingNote,
  ].filter(Boolean);

  await tx.orderEvent.create({
    data: {
      orderId,
      status: to,
      title: EVENT_TITLES[to],
      note: noteParts.length ? noteParts.join(' · ') : null,
      location: tracking?.location ?? null,
      actorName: tracking?.actorName ?? null,
    },
  });
}

export async function cancelOrder(tx: Tx, order: { id: string; status: OrderStatus }, note?: string, actorName?: string) {
  await transitionOrder(tx, order.id, order.status, 'CANCELLED', { trackingNote: note, actorName });
  const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
  for (const i of items) await tx.product.update({ where: { id: i.productId }, data: { quantity: { increment: i.quantity } } });
  await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'FAILED' } });
}

// Releases stock held by unpaid orders. Skips orders with a payment attempt in the last 30 minutes,
// so a buyer who is mid-checkout on Paystack doesn't have their order cancelled under them.
export async function expireStaleOrders(ttlHours: number) {
  const now = Date.now();
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(now - ttlHours * 3_600_000) }, payment: { is: { updatedAt: { lt: new Date(now - 30 * 60_000) } } } },
    select: { id: true, status: true }, take: 100,
  });
  let expired = 0;
  for (const order of stale) {
    try { await prisma.$transaction((tx) => cancelOrder(tx, order, 'Cancelled automatically after payment timeout', 'System')); expired++; }
    catch (e) { if (!(e instanceof HttpError)) throw e; }
  }
  return expired;
}

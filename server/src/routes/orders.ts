import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError, param } from '../lib/http.js';
import { parsePagination, setPaginationHeaders } from '../lib/pagination.js';
import { auth, roles, type AuthRequest } from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';
import { notifyUser } from '../services/notifications.js';
import { cancelOrder, transitionOrder } from '../services/orders.js';

const router = Router();
const createSchema = z.object({
  items: z.array(z.object({ productId: z.uuid('Invalid product'), quantity: z.number().int().min(1).max(10_000) })).min(1, 'Cart is empty').max(50),
  deliveryOption: z.enum(['DELIVERY', 'PICKUP']),
  deliveryAddress: z.string().trim().max(500).optional().transform((v) => v || undefined),
}).refine((d) => d.deliveryOption === 'PICKUP' || !!d.deliveryAddress, { message: 'Delivery address is required for delivery orders', path: ['deliveryAddress'] });

const optionalTrimmed = (max = 200) => z.string().trim().max(max).nullish().transform((v) => v || undefined);
const statusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  carrier: optionalTrimmed(80),
  trackingNumber: optionalTrimmed(80),
  trackingNote: optionalTrimmed(400),
  location: optionalTrimmed(120),
  estimatedDelivery: z.string().trim().nullish().transform((v) => (v ? new Date(v) : undefined)),
});

const trackingSchema = z.object({
  carrier: optionalTrimmed(80),
  trackingNumber: optionalTrimmed(80),
  trackingNote: optionalTrimmed(400),
  location: optionalTrimmed(120),
  estimatedDelivery: z.string().trim().nullish().transform((v) => (v ? new Date(v) : undefined)),
});

export const orderInclude = {
  items: { include: { product: { select: { id: true, name: true, imageUrl: true, farmerId: true, category: true } } } },
  payment: true,
  buyer: { select: { id: true, name: true, email: true } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

// Who may move an order from one status to the next. PAID normally comes from Paystack; admins can also confirm offline payments (e.g. bank transfer).
const FULFILMENT: Partial<Record<OrderStatus, OrderStatus>> = { PAID: 'CONFIRMED', CONFIRMED: 'SHIPPED', SHIPPED: 'DELIVERED' };
function canTransition(actor: 'BUYER' | 'FARMER' | 'ADMIN', from: OrderStatus, to: OrderStatus) {
  if (actor === 'BUYER') return from === 'PENDING' && to === 'CANCELLED';
  if (actor === 'FARMER') return FULFILMENT[from] === to;
  if (to === 'CANCELLED') return ['PENDING', 'PAID', 'CONFIRMED'].includes(from);
  return (from === 'PENDING' && to === 'PAID') || FULFILMENT[from] === to;
}

const shortOrderRef = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

router.post('/', auth, roles('BUYER', 'INDUSTRY'), async (req: AuthRequest, res) => {
  const input = createSchema.parse(req.body);
  const quantities = new Map<string, number>();
  for (const i of input.items) quantities.set(i.productId, (quantities.get(i.productId) ?? 0) + i.quantity);

  const order = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { id: { in: [...quantities.keys()] }, isActive: true } });
    if (products.length !== quantities.size) throw new HttpError(400, 'One or more products are no longer available');
    let total = new Prisma.Decimal(0);
    const items = [];
    for (const p of products) {
      const quantity = quantities.get(p.id)!;
      // Conditional decrement: fails atomically if a concurrent order took the stock first.
      const { count } = await tx.product.updateMany({ where: { id: p.id, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
      if (!count) throw new HttpError(409, `Only ${p.quantity} unit(s) of ${p.name} left in stock`);
      total = total.add(p.price.mul(quantity));
      items.push({ productId: p.id, quantity, unitPrice: p.price });
    }
    return tx.order.create({
      data: {
        buyerId: req.user!.id,
        totalPrice: total,
        deliveryOption: input.deliveryOption,
        deliveryAddress: input.deliveryOption === 'DELIVERY' ? input.deliveryAddress : null,
        items: { create: items },
        payment: { create: { amount: total, paymentMethod: 'PAYSTACK', status: 'PENDING' } },
        events: {
          create: {
            status: 'PENDING',
            title: 'Order placed — stock reserved',
            note: input.deliveryOption === 'DELIVERY' ? `Delivery to ${input.deliveryAddress}` : 'Pickup at FarmExpress hub',
          },
        },
      },
      include: orderInclude,
    });
  });

  await notifyUser({
    userId: order.buyerId,
    type: 'ORDER_PLACED',
    title: `Order ${shortOrderRef(order.id)} placed`,
    body: `Your stock has been reserved (₦${Number(order.totalPrice).toLocaleString()}). Complete payment to start fulfilment.`,
    orderId: order.id,
  });

  res.status(201).json(order);
});

router.get('/mine', auth, async (req: AuthRequest, res) => {
  const { page, limit, skip } = parsePagination(req.query, 50);
  const where: Prisma.OrderWhereInput = { buyerId: req.user!.id };
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
  ]);
  setPaginationHeaders(res, { total, page, limit });
  res.json(items);
});

router.get('/incoming', auth, roles('FARMER'), async (req: AuthRequest, res) => {
  const { page, limit, skip } = parsePagination(req.query, 50);
  const where: Prisma.OrderWhereInput = { items: { some: { product: { farmerId: req.user!.id } } } };
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
  ]);
  setPaginationHeaders(res, { total, page, limit });
  res.json(items);
});

router.get('/', auth, roles('ADMIN'), async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, 50);
  const statusFilter = typeof req.query.status === 'string' && req.query.status ? (req.query.status as OrderStatus) : undefined;
  const where: Prisma.OrderWhereInput = statusFilter ? { status: statusFilter } : {};
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
  ]);
  setPaginationHeaders(res, { total, page, limit });
  res.json(items);
});

router.put('/:id/status', auth, async (req: AuthRequest, res) => {
  const input = statusSchema.parse(req.body);
  const { status } = input;
  const order = await prisma.order.findUnique({ where: { id: param(req) }, include: { items: { include: { product: true } } } });
  if (!order) throw new HttpError(404, 'Order not found');

  const me = req.user!;
  const actorUser = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true, email: true } });
  const isBuyer = order.buyerId === me.id;
  const ownsAllItems = order.items.every((i) => i.product.farmerId === me.id);
  const actor = me.role === 'ADMIN' ? 'ADMIN' : ownsAllItems && me.role === 'FARMER' ? 'FARMER' : isBuyer ? 'BUYER' : null;
  if (!actor) {
    if (order.items.some((i) => i.product.farmerId === me.id)) throw new HttpError(403, 'Orders with products from several farms are fulfilled by FarmExpress operations');
    throw new HttpError(404, 'Order not found');
  }
  if (!canTransition(actor, order.status, status)) throw new HttpError(409, `Cannot move order from ${order.status} to ${status}`);

  const updated = await prisma.$transaction(async (tx) => {
    if (status === 'CANCELLED') {
      await cancelOrder(tx, order, input.trackingNote, actorUser?.name);
    } else {
      await transitionOrder(tx, order.id, order.status, status, {
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        trackingNote: input.trackingNote,
        location: input.location,
        estimatedDelivery: input.estimatedDelivery,
        actorName: actorUser?.name,
      });
    }
    if (status === 'PAID') {
      await tx.payment.update({
        where: { orderId: order.id },
        data: { status: 'SUCCESSFUL', paymentMethod: 'MANUAL', transactionId: `manual:${me.id}:${Date.now()}`, paidAt: new Date() },
      });
    }
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  await recordAudit({
    actorId: me.id,
    actorEmail: actorUser?.email,
    action: 'ORDER_STATUS_UPDATED',
    targetType: 'ORDER',
    targetId: order.id,
    summary: `Order ${shortOrderRef(order.id)} moved from ${order.status} to ${status}`,
    metadata: {
      from: order.status,
      to: status,
      carrier: input.carrier ?? null,
      trackingNumber: input.trackingNumber ?? null,
    },
  });

  const ref = shortOrderRef(order.id);
  const notifyMap: Partial<Record<OrderStatus, { type: Parameters<typeof notifyUser>[0]['type']; title: string; body: string }>> = {
    PAID: {
      type: 'ORDER_PAID',
      title: `Payment confirmed for ${ref}`,
      body: 'Your payment has been confirmed. The farm is preparing your produce.',
    },
    CONFIRMED: {
      type: 'ORDER_CONFIRMED',
      title: `Order ${ref} confirmed`,
      body: 'Your produce is being harvested and packed for dispatch.',
    },
    SHIPPED: {
      type: 'ORDER_SHIPPED',
      title: `Order ${ref} dispatched`,
      body: [
        'Your order is on its way!',
        updated.carrier && `Carrier: ${updated.carrier}.`,
        updated.trackingNumber && `Tracking: ${updated.trackingNumber}.`,
        updated.trackingNote,
      ].filter(Boolean).join(' '),
    },
    DELIVERED: {
      type: 'ORDER_DELIVERED',
      title: `Order ${ref} delivered`,
      body: 'Your produce has been delivered. Enjoy, and let us know how it was with a review!',
    },
    CANCELLED: {
      type: 'ORDER_CANCELLED',
      title: `Order ${ref} cancelled`,
      body: 'This order was cancelled and any reserved stock was released.',
    },
  };

  const notification = notifyMap[status];
  if (notification) {
    await notifyUser({
      userId: order.buyerId,
      ...notification,
      orderId: order.id,
    });
  }

  res.json(updated);
});

router.patch('/:id/tracking', auth, roles('FARMER', 'ADMIN'), async (req: AuthRequest, res) => {
  const input = trackingSchema.parse(req.body);
  const order = await prisma.order.findUnique({ where: { id: param(req) }, include: { items: { include: { product: true } } } });
  if (!order) throw new HttpError(404, 'Order not found');

  const me = req.user!;
  const ownsAllItems = order.items.every((i) => i.product.farmerId === me.id);
  if (me.role !== 'ADMIN' && !ownsAllItems) throw new HttpError(403, 'Forbidden');

  const actorUser = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true, email: true } });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
        ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
        ...(input.trackingNote !== undefined ? { trackingNote: input.trackingNote } : {}),
        ...(input.estimatedDelivery !== undefined ? { estimatedDelivery: input.estimatedDelivery } : {}),
      },
    });
    const noteParts = [
      input.carrier && `Carrier: ${input.carrier}`,
      input.trackingNumber && `Tracking: ${input.trackingNumber}`,
      input.trackingNote,
    ].filter(Boolean);
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        status: order.status,
        title: 'Tracking update',
        note: noteParts.length ? noteParts.join(' · ') : 'Delivery tracking updated',
        location: input.location ?? null,
        actorName: actorUser?.name ?? null,
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  await recordAudit({
    actorId: me.id,
    actorEmail: actorUser?.email,
    action: 'ORDER_TRACKING_UPDATED',
    targetType: 'ORDER',
    targetId: order.id,
    summary: `Updated delivery tracking for ${shortOrderRef(order.id)}`,
    metadata: { carrier: input.carrier ?? null, trackingNumber: input.trackingNumber ?? null, location: input.location ?? null },
  });

  res.json(updated);
});

export default router;

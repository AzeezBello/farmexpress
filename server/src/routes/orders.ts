import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError, param } from '../lib/http.js';
import { auth, roles, type AuthRequest } from '../middleware/auth.js';
import { cancelOrder, transitionOrder } from '../services/orders.js';

const router = Router();
const createSchema = z.object({
  items: z.array(z.object({ productId: z.uuid('Invalid product'), quantity: z.number().int().min(1).max(10_000) })).min(1, 'Cart is empty').max(50),
  deliveryOption: z.enum(['DELIVERY', 'PICKUP']),
  deliveryAddress: z.string().trim().max(500).optional().transform((v) => v || undefined),
}).refine((d) => d.deliveryOption === 'PICKUP' || !!d.deliveryAddress, { message: 'Delivery address is required for delivery orders', path: ['deliveryAddress'] });
const statusSchema = z.object({ status: z.enum(['PENDING', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']) });

const orderInclude = {
  items: { include: { product: { select: { id: true, name: true, imageUrl: true, farmerId: true, category: true } } } },
  payment: true,
  buyer: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

// Who may move an order from one status to the next. PAID normally comes from Paystack; admins can also confirm offline payments (e.g. bank transfer).
const FULFILMENT: Partial<Record<OrderStatus, OrderStatus>> = { PAID: 'CONFIRMED', CONFIRMED: 'SHIPPED', SHIPPED: 'DELIVERED' };
function canTransition(actor: 'BUYER' | 'FARMER' | 'ADMIN', from: OrderStatus, to: OrderStatus) {
  if (actor === 'BUYER') return from === 'PENDING' && to === 'CANCELLED';
  if (actor === 'FARMER') return FULFILMENT[from] === to;
  if (to === 'CANCELLED') return ['PENDING', 'PAID', 'CONFIRMED'].includes(from);
  return (from === 'PENDING' && to === 'PAID') || FULFILMENT[from] === to;
}

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
        buyerId: req.user!.id, totalPrice: total, deliveryOption: input.deliveryOption,
        deliveryAddress: input.deliveryOption === 'DELIVERY' ? input.deliveryAddress : null,
        items: { create: items }, payment: { create: { amount: total, paymentMethod: 'PAYSTACK', status: 'PENDING' } },
      },
      include: orderInclude,
    });
  });
  res.status(201).json(order);
});

router.get('/mine', auth, async (req: AuthRequest, res) => {
  res.json(await prisma.order.findMany({ where: { buyerId: req.user!.id }, include: orderInclude, orderBy: { createdAt: 'desc' } }));
});

router.get('/incoming', auth, roles('FARMER'), async (req: AuthRequest, res) => {
  res.json(await prisma.order.findMany({ where: { items: { some: { product: { farmerId: req.user!.id } } } }, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 200 }));
});

router.get('/', auth, roles('ADMIN'), async (_req, res) => {
  res.json(await prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: 'desc' }, take: 200 }));
});

router.put('/:id/status', auth, async (req: AuthRequest, res) => {
  const { status } = statusSchema.parse(req.body);
  const order = await prisma.order.findUnique({ where: { id: param(req) }, include: { items: { include: { product: true } } } });
  if (!order) throw new HttpError(404, 'Order not found');

  const me = req.user!;
  const isBuyer = order.buyerId === me.id;
  const ownsAllItems = order.items.every((i) => i.product.farmerId === me.id);
  const actor = me.role === 'ADMIN' ? 'ADMIN' : ownsAllItems && me.role === 'FARMER' ? 'FARMER' : isBuyer ? 'BUYER' : null;
  if (!actor) {
    if (order.items.some((i) => i.product.farmerId === me.id)) throw new HttpError(403, 'Orders with products from several farms are fulfilled by FarmExpress operations');
    throw new HttpError(404, 'Order not found');
  }
  if (!canTransition(actor, order.status, status)) throw new HttpError(409, `Cannot move order from ${order.status} to ${status}`);

  const updated = await prisma.$transaction(async (tx) => {
    if (status === 'CANCELLED') await cancelOrder(tx, order);
    else await transitionOrder(tx, order.id, order.status, status);
    if (status === 'PAID') await tx.payment.update({ where: { orderId: order.id }, data: { status: 'SUCCESSFUL', paymentMethod: 'MANUAL', transactionId: `manual:${me.id}:${Date.now()}`, paidAt: new Date() } });
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
  res.json(updated);
});

export default router;

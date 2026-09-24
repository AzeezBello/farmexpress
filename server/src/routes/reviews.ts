import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';
import { auth, type AuthRequest } from '../middleware/auth.js';

const router = Router();
const reviewSchema = z.object({ productId: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional().transform((v) => v || undefined) });

router.get('/product/:productId', async (req, res) => {
  res.json(await prisma.review.findMany({ where: { productId: req.params.productId }, include: { buyer: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }));
});

router.get('/mine', auth, async (req: AuthRequest, res) => {
  res.json(await prisma.review.findMany({ where: { buyerId: req.user!.id }, select: { id: true, productId: true, rating: true, comment: true } }));
});

router.post('/', auth, async (req: AuthRequest, res) => {
  const d = reviewSchema.parse(req.body);
  const purchased = await prisma.orderItem.findFirst({ where: { productId: d.productId, order: { buyerId: req.user!.id, status: 'DELIVERED' } } });
  if (!purchased) throw new HttpError(403, 'You can review a product after your order is delivered');
  if (await prisma.review.findUnique({ where: { buyerId_productId: { buyerId: req.user!.id, productId: d.productId } } })) throw new HttpError(409, 'You have already reviewed this product');
  res.status(201).json(await prisma.review.create({ data: { ...d, buyerId: req.user!.id } }));
});

export default router;

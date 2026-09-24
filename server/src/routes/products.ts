import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, param } from '../lib/http.js';
import { auth, roles, type AuthRequest } from '../middleware/auth.js';

const router = Router();
export const CATEGORIES = ['Fruits', 'Vegetables', 'Grains', 'Roots & Tubers', 'Legumes', 'Spices', 'Livestock'] as const;
const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(2000),
  price: z.coerce.number().positive().max(100_000_000),
  quantity: z.coerce.number().int().nonnegative().max(1_000_000),
  category: z.enum(CATEGORIES),
  imageUrl: z.union([z.url(), z.literal('')]).nullish().transform((v) => v || null),
  location: z.string().trim().max(120).nullish().transform((v) => v || null),
});
const listQuery = z.object({ search: z.string().trim().max(100).optional(), category: z.string().max(40).optional(), farmerId: z.string().max(64).optional() });
const farmerSelect = { select: { id: true, name: true, farmLocation: true, kycStatus: true } } as const;

type WithRatings = { reviews: { rating: number }[] };
const withRating = <T extends WithRatings>({ reviews, ...p }: T) => ({
  ...p, reviewCount: reviews.length,
  rating: reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null,
});

async function ownedProduct(id: string, farmerId: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.farmerId !== farmerId || !product.isActive) throw new HttpError(404, 'Product not found');
  return product;
}

router.get('/categories', (_, res) => res.json(CATEGORIES));

router.get('/', async (req, res) => {
  const { search, category, farmerId } = listQuery.parse(req.query);
  const products = await prisma.product.findMany({
    where: {
      isActive: true, quantity: { gt: 0 },
      category: category || undefined, farmerId: farmerId || undefined,
      OR: search ? [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }, { category: { contains: search, mode: 'insensitive' } }] : undefined,
    },
    include: { farmer: farmerSelect, reviews: { select: { rating: true } } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  res.json(products.map(withRating));
});

router.get('/mine', auth, roles('FARMER'), async (req: AuthRequest, res) => {
  const products = await prisma.product.findMany({
    where: { farmerId: req.user!.id, isActive: true },
    include: { farmer: farmerSelect, reviews: { select: { rating: true } } }, orderBy: { createdAt: 'desc' },
  });
  res.json(products.map(withRating));
});

router.get('/:id', async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: param(req) }, include: { farmer: farmerSelect, reviews: { include: { buyer: { select: { name: true } } }, orderBy: { createdAt: 'desc' } } } });
  if (!p || !p.isActive) throw new HttpError(404, 'Product not found');
  res.json({ ...withRating(p), reviews: p.reviews });
});

router.post('/', auth, roles('FARMER'), async (req: AuthRequest, res) => {
  const farmer = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (farmer?.kycStatus !== 'APPROVED') throw new HttpError(403, 'Your farm must be verified before you can list products');
  const data = productSchema.parse(req.body);
  const p = await prisma.product.create({ data: { ...data, location: data.location ?? farmer.farmLocation, farmerId: farmer.id } });
  res.status(201).json(p);
});

router.put('/:id', auth, roles('FARMER'), async (req: AuthRequest, res) => {
  await ownedProduct(param(req), req.user!.id);
  const p = await prisma.product.update({ where: { id: param(req) }, data: productSchema.partial().parse(req.body) });
  res.json(p);
});

// Products referenced by orders are archived rather than deleted so order history stays intact.
router.delete('/:id', auth, roles('FARMER'), async (req: AuthRequest, res) => {
  const product = await ownedProduct(param(req), req.user!.id);
  const ordered = await prisma.orderItem.count({ where: { productId: product.id } });
  if (ordered) await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
  else await prisma.product.delete({ where: { id: product.id } });
  res.status(204).send();
});

export default router;

import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError, param } from '../lib/http.js';
import { auth, type AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/', async (req: AuthRequest, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(items);
});

router.patch('/:id/read', async (req: AuthRequest, res) => {
  const id = param(req);
  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, 'Notification not found');
  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: existing.readAt ?? new Date() },
  });
  res.json(updated);
});

router.post('/read-all', async (req: AuthRequest, res) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: count });
});

export default router;

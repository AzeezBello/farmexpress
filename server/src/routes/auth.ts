import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';
import { publicUser, signToken } from '../lib/tokens.js';
import { auth, type AuthRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));
const optionalText = z.string().trim().max(120).optional().transform((v) => v || undefined);
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80), email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['FARMER', 'BUYER', 'INDUSTRY']).default('BUYER'),
  businessName: optionalText, farmLocation: optionalText,
}).refine((d) => d.role !== 'FARMER' || !!d.farmLocation, { message: 'Farm location is required for farmers', path: ['farmLocation'] });
const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) });
const profileSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), businessName: optionalText, farmLocation: optionalText });

router.post('/register', limiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'Email already registered');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const { password: _password, ...data } = input;
  const user = await prisma.user.create({ data: { ...data, passwordHash } });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', limiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', auth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json(publicUser(user));
});

router.patch('/me', auth, async (req: AuthRequest, res) => {
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: profileSchema.parse(req.body) });
  res.json(publicUser(user));
});

export default router;

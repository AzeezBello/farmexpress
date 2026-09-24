import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export type AuthRequest = Request & { user?: { id: string; role: string } };
export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try { req.user = jwt.verify(token, config.jwtSecret) as { id: string; role: string }; next(); }
  catch { return res.status(401).json({ message: 'Invalid or expired token' }); }
}
export function roles(...allowed: string[]) { return (req: AuthRequest, res: Response, next: NextFunction) => allowed.includes(req.user?.role ?? '') ? next() : res.status(403).json({ message: 'Forbidden' }); }

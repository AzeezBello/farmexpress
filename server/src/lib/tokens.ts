import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { config } from '../config.js';

export const signToken = (user: Pick<User, 'id' | 'role'>) => jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });

export const publicUser = (user: User) => ({
  id: user.id, name: user.name, email: user.email, role: user.role, kycStatus: user.kycStatus,
  businessName: user.businessName, farmLocation: user.farmLocation, createdAt: user.createdAt,
});

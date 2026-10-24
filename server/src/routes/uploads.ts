import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, param } from '../lib/http.js';
import { auth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const KYC_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(160),
  mimeType: z.string().trim().toLowerCase(),
  data: z.string().min(8),
  purpose: z.enum(['PRODUCT', 'KYC']).default('PRODUCT'),
});

function decodeBase64Payload(raw: string): { mimeFromHeader?: string; buffer: Buffer } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(raw.trim());
  const base64 = match ? match[2] : raw.trim();
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    throw new HttpError(400, 'Invalid base64 file data');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.byteLength) throw new HttpError(400, 'Uploaded file is empty');
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, 'File exceeds maximum size of 4 MB');
  }
  return { mimeFromHeader: match?.[1]?.toLowerCase(), buffer };
}

router.post('/', auth, async (req: AuthRequest, res) => {
  const input = uploadSchema.parse(req.body);
  const { mimeFromHeader, buffer } = decodeBase64Payload(input.data);
  const mimeType = mimeFromHeader || input.mimeType;

  const allowed: readonly string[] = input.purpose === 'KYC' ? KYC_MIMES : IMAGE_MIMES;
  if (!allowed.includes(mimeType)) {
    throw new HttpError(
      400,
      input.purpose === 'KYC'
        ? 'Unsupported document format. Upload a PDF, JPG, PNG, or WebP file.'
        : 'Unsupported image format. Upload a JPG, PNG, WebP, or GIF image.',
    );
  }

  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload';
  const created = await prisma.upload.create({
    data: {
      userId: req.user!.id,
      filename: safeName,
      mimeType,
      size: buffer.byteLength,
      data: new Uint8Array(buffer),
      purpose: input.purpose,
    },
    select: { id: true, filename: true, mimeType: true, size: true, purpose: true, createdAt: true },
  });

  res.status(201).json({
    ...created,
    url: `/api/uploads/${created.id}`,
  });
});

router.get('/:id', async (req, res) => {
  const upload = await prisma.upload.findUnique({ where: { id: param(req) } });
  if (!upload) throw new HttpError(404, 'File not found');
  res.setHeader('Content-Type', upload.mimeType);
  res.setHeader('Content-Length', String(upload.size));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${upload.filename}"`);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(upload.data));
});

export default router;

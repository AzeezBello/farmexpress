import type { Response } from 'express';
import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function parsePagination(query: unknown, defaultLimit = 50) {
  const parsed = paginationQuery.safeParse(query);
  const page = parsed.success && parsed.data.page ? parsed.data.page : 1;
  const limit = parsed.success && parsed.data.limit ? parsed.data.limit : defaultLimit;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function setPaginationHeaders(res: Response, meta: { total: number; page: number; limit: number }) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));
  res.setHeader('X-Total-Count', String(meta.total));
  res.setHeader('X-Page', String(meta.page));
  res.setHeader('X-Page-Size', String(meta.limit));
  res.setHeader('X-Total-Pages', String(totalPages));
  return { total: meta.total, page: meta.page, pageSize: meta.limit, totalPages };
}

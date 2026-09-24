import type { OrderStatus } from './types';

export const CATEGORIES = ['Fruits', 'Vegetables', 'Grains', 'Roots & Tubers', 'Legumes', 'Spices', 'Livestock'];
export const naira = (n: number | string) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200', PAID: 'bg-sky-50 text-sky-700 ring-sky-200',
  CONFIRMED: 'bg-indigo-50 text-indigo-700 ring-indigo-200', SHIPPED: 'bg-violet-50 text-violet-700 ring-violet-200',
  DELIVERED: 'bg-green-50 text-green-700 ring-green-200', CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
};
export const STATUS_LABEL: Record<OrderStatus, string> = { PENDING: 'Awaiting payment', PAID: 'Paid', CONFIRMED: 'Confirmed', SHIPPED: 'Dispatched', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

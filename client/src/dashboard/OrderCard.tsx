import type { ReactNode } from 'react';
import { CreditCard, MapPin, Truck } from 'lucide-react';
import { naira, shortDate, shortId } from '../lib/format';
import type { Order } from '../lib/types';
import { StatusBadge } from '../components/ui';
import { FALLBACK_IMAGE } from '../components/ProductCard';

function PaymentLine({ order }: { order: Order }) {
  const p = order.payment;
  if (!p || p.status !== 'SUCCESSFUL') return null;
  const how = p.paymentMethod === 'MANUAL' ? 'offline payment' : `Paystack${p.channel ? ` · ${p.channel.replace(/_/g, ' ')}` : ''}`;
  if (order.status === 'CANCELLED') return <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Refund due — paid via {how} after the order was cancelled</p>;
  return <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><CreditCard size={14} /> Paid via {how}{p.paidAt && ` on ${shortDate(p.paidAt)}`}</p>;
}

export default function OrderCard({ order, showBuyer, farmerId, actions, itemAction }: { order: Order; showBuyer?: boolean; farmerId?: string; actions?: ReactNode; itemAction?: (item: Order['items'][number]) => ReactNode }) {
  return <article className="rounded-2xl border bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><b className="font-mono text-sm">{shortId(order.id)}</b><p className="text-xs text-slate-500">{shortDate(order.createdAt)}{showBuyer && ` · ${order.buyer.name}`}</p></div>
      <StatusBadge status={order.status} />
    </div>
    <ul className="mt-4 divide-y">{order.items.map((i) => {
      const mine = !farmerId || i.product.farmerId === farmerId;
      return <li key={i.id} className={`flex items-center gap-3 py-2.5 ${mine ? '' : 'opacity-50'}`}>
        <img src={i.product.imageUrl || FALLBACK_IMAGE} alt="" className="h-11 w-11 rounded-lg object-cover" />
        <div className="min-w-0 flex-1"><b className="block truncate text-sm">{i.product.name}</b><span className="text-xs text-slate-500">{i.quantity} × {naira(i.unitPrice)}{!mine && ' · another farm'}</span></div>
        {itemAction?.(i)}
      </li>;
    })}</ul>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">{order.deliveryOption === 'DELIVERY' ? <><Truck size={14} /> {order.deliveryAddress}</> : <><MapPin size={14} /> Pickup hub</>}</span>
      <b>{naira(order.totalPrice)}</b>
    </div>
    <PaymentLine order={order} />
    {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
  </article>;
}

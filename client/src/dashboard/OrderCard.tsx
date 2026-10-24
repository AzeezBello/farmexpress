import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Clock, CreditCard, MapPin, PackageCheck, RotateCcw, Truck } from 'lucide-react';
import { resolveAssetUrl } from '../lib/api';
import { dateTime, naira, shortDate, shortId } from '../lib/format';
import type { Order, OrderStatus } from '../lib/types';
import { StatusBadge } from '../components/ui';
import { FALLBACK_IMAGE } from '../components/ProductCard';

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PENDING', label: 'Placed' },
  { status: 'PAID', label: 'Paid' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'SHIPPED', label: 'Dispatched' },
  { status: 'DELIVERED', label: 'Delivered' },
];

function FulfilmentStepper({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') return null;
  const activeIdx = STEPS.findIndex((s) => s.status === status);
  return (
    <ol aria-label="Order progress" className="mt-4 grid grid-cols-5 gap-1.5">
      {STEPS.map((step, idx) => {
        const done = idx <= activeIdx;
        return (
          <li key={step.status} className="text-center">
            <div className={`h-1.5 rounded-full transition-colors ${done ? 'bg-green-600' : 'bg-slate-200'}`} />
            <span className={`mt-1 block text-[11px] font-semibold ${done ? 'text-green-800' : 'text-slate-400'}`}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function TrackingSummary({ order }: { order: Order }) {
  if (!order.carrier && !order.trackingNumber && !order.trackingNote && !order.estimatedDelivery) return null;
  return (
    <div className="mt-3 rounded-xl border border-green-100 bg-green-50/60 p-3 text-xs text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-bold text-green-900">
          <PackageCheck size={14} className="text-green-700" />
          {order.carrier || 'Delivery tracking'}
          {order.trackingNumber && <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-green-200">{order.trackingNumber}</span>}
        </span>
        {order.estimatedDelivery && <span className="text-slate-500">ETA: {shortDate(order.estimatedDelivery)}</span>}
      </div>
      {order.trackingNote && <p className="mt-1 text-slate-600">{order.trackingNote}</p>}
    </div>
  );
}

function PaymentLine({ order }: { order: Order }) {
  const p = order.payment;
  if (!p) return null;
  if (p.status === 'REFUNDED') {
    return (
      <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
        <RotateCcw size={14} /> Refunded{p.refundedAt ? ` on ${shortDate(p.refundedAt)}` : ''}{p.refundReason ? ` · ${p.refundReason}` : ''}
      </p>
    );
  }
  if (p.status !== 'SUCCESSFUL') return null;
  const how = p.paymentMethod === 'MANUAL' ? 'offline payment' : `Paystack${p.channel ? ` · ${p.channel.replace(/_/g, ' ')}` : ''}`;
  if (order.status === 'CANCELLED') {
    return <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Refund due — paid via {how} after the order was cancelled</p>;
  }
  return <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><CreditCard size={14} /> Paid via {how}{p.paidAt && ` on ${shortDate(p.paidAt)}`}</p>;
}

export default function OrderCard({
  order,
  showBuyer,
  farmerId,
  actions,
  itemAction,
}: {
  order: Order;
  showBuyer?: boolean;
  farmerId?: string;
  actions?: ReactNode;
  itemAction?: (item: Order['items'][number]) => ReactNode;
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const events = order.events ?? [];

  return (
    <article className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <b className="font-mono text-sm">{shortId(order.id)}</b>
          <p className="text-xs text-slate-500">
            {shortDate(order.createdAt)}
            {showBuyer && ` · ${order.buyer.name}`}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <FulfilmentStepper status={order.status} />
      <TrackingSummary order={order} />

      <ul className="mt-4 divide-y">
        {order.items.map((i) => {
          const mine = !farmerId || i.product.farmerId === farmerId;
          return (
            <li key={i.id} className={`flex items-center gap-3 py-2.5 ${mine ? '' : 'opacity-50'}`}>
              <img src={resolveAssetUrl(i.product.imageUrl) || FALLBACK_IMAGE} alt="" className="h-11 w-11 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm">{i.product.name}</b>
                <span className="text-xs text-slate-500">
                  {i.quantity} × {naira(i.unitPrice)}
                  {!mine && ' · another farm'}
                </span>
              </div>
              {itemAction?.(i)}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {order.deliveryOption === 'DELIVERY' ? (
            <>
              <Truck size={14} /> {order.deliveryAddress}
            </>
          ) : (
            <>
              <MapPin size={14} /> Pickup hub
            </>
          )}
        </span>
        <b>{naira(order.totalPrice)}</b>
      </div>

      <PaymentLine order={order} />

      {events.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={showTimeline}
            onClick={() => setShowTimeline((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <Clock size={13} /> {showTimeline ? 'Hide' : 'View'} activity timeline ({events.length})
            {showTimeline ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showTimeline && (
            <ol className="mt-2.5 space-y-2 border-l-2 border-slate-200 pl-3 text-xs">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <div className="font-semibold text-slate-800">{ev.title}</div>
                  {ev.note && <div className="text-slate-600">{ev.note}</div>}
                  <div className="text-[11px] text-slate-400">
                    {dateTime(ev.createdAt)}
                    {ev.location ? ` · ${ev.location}` : ''}
                    {ev.actorName ? ` · ${ev.actorName}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}

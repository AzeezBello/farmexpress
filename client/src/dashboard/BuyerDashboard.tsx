import { useState } from 'react';
import { LayoutDashboard, Package, Star, UserRound } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { payForOrder } from '../lib/payments';
import { naira } from '../lib/format';
import { navigate, useToast } from '../lib/hooks';
import type { Order, User } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import Toast from '../components/Toast';
import { Button, Empty, ErrorText, Spinner } from '../components/ui';
import Layout, { PageTitle, Stat } from './Layout';
import OrderCard from './OrderCard';
import { KycBanner, ProfilePanel, ReviewModal, setOrderStatus } from './shared';

export default function BuyerDashboard({ user, tab }: { user: User; tab: string }) {
  const orders = useAsync(() => api<Order[]>('/orders/mine'));
  const reviews = useAsync(() => api<{ productId: string }[]>('/reviews/mine'));
  const payConfig = useAsync(() => api<{ paystack: boolean; pendingOrderTtlHours: number }>('/payments/config'));
  const ttl = payConfig.data?.pendingOrderTtlHours;
  const [reviewing, setReviewing] = useState<{ id: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState('');
  const [toast, showToast] = useToast();
  const list = orders.data ?? [];
  const reviewed = new Set((reviews.data ?? []).map((r) => r.productId));
  const active = list.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));

  async function pay(o: Order) {
    setBusyId(`pay:${o.id}`);
    try { await payForOrder(o.id); }
    catch (e) {
      setBusyId('');
      showToast(e instanceof ApiError && e.status === 503 ? 'Online payment isn’t available yet — our team will contact you with payment details.' : e instanceof Error ? e.message : 'Could not start payment', 4500);
      if (e instanceof ApiError && e.status === 409) void orders.reload();
    }
  }

  async function cancel(o: Order) {
    if (!window.confirm('Cancel this order? Reserved stock will be released.')) return;
    setBusyId(o.id);
    try { const updated = await setOrderStatus(o.id, 'CANCELLED'); orders.setData(list.map((x) => x.id === o.id ? updated : x)); showToast('Order cancelled'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not cancel'); } finally { setBusyId(''); }
  }

  const renderOrders = (items: Order[]) => items.map((o) => <OrderCard key={o.id} order={o}
    actions={o.status === 'PENDING' ? <><p className="w-full text-xs text-slate-500">Stock is reserved for you. {ttl ? `Unpaid orders are cancelled automatically after ${ttl} hour${ttl === 1 ? '' : 's'}.` : 'Unpaid orders are cancelled automatically.'}</p><Button busy={busyId === `pay:${o.id}`} disabled={!!busyId} onClick={() => pay(o)}>Pay now</Button><Button variant="danger" busy={busyId === o.id} disabled={!!busyId} onClick={() => cancel(o)}>Cancel order</Button></> : undefined}
    itemAction={o.status === 'DELIVERED' ? (i) => reviewed.has(i.productId) ? <span className="text-xs text-green-700">Reviewed</span> : <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setReviewing({ id: i.productId, name: i.product.name })}>Review</Button> : undefined} />);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'orders', label: 'My orders', icon: <Package size={18} />, badge: active.length },
    { id: 'profile', label: 'Profile', icon: <UserRound size={18} /> },
  ];

  let body;
  if (tab === 'profile') body = <ProfilePanel user={user} />;
  else if (orders.loading && !orders.data) body = <Spinner />;
  else if (tab === 'orders') body = <>
    <PageTitle title="My orders" text="Track and manage everything you've ordered." />
    <ErrorText>{orders.error}</ErrorText>
    <div className="grid gap-4 xl:grid-cols-2">{list.length ? renderOrders(list) : <Empty title="No orders yet" text="Your orders will appear here." action={<Button onClick={() => navigate('')}>Browse produce</Button>} />}</div>
  </>;
  else body = <>
    <PageTitle title={`Hello, ${user.name.split(' ')[0]}`} text="Your FarmExpress activity at a glance." />
    {user.role === 'INDUSTRY' && <KycBanner status={user.kycStatus} role={user.role} />}
    <ErrorText>{orders.error}</ErrorText>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Total spent" value={naira(list.filter((o) => !['PENDING', 'CANCELLED'].includes(o.status)).reduce((s, o) => s + Number(o.totalPrice), 0))} hint="Paid orders" />
      <Stat label="Orders" value={list.length} />
      <Stat label="In progress" value={active.length} />
      <Stat label="Reviews written" value={<span className="inline-flex items-center gap-1">{reviewed.size}<Star size={18} className="fill-amber-400 text-amber-400" /></span>} />
    </div>
    <h2 className="mb-3 mt-8 font-bold">Recent orders</h2>
    <div className="grid gap-4 xl:grid-cols-2">{list.length ? renderOrders(list.slice(0, 2)) : <Empty title="No orders yet" text="Fresh produce is a few taps away." action={<Button onClick={() => navigate('')}>Start shopping</Button>} />}</div>
  </>;

  return <Layout user={user} tabs={tabs} tab={tab}>
    {body}
    {reviewing && <ReviewModal productId={reviewing.id} productName={reviewing.name} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); void reviews.reload(); showToast('Thanks for your review'); }} />}
    <Toast message={toast} />
  </Layout>;
}

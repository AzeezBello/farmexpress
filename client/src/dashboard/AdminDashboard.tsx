import { useState } from 'react';
import { LayoutDashboard, ShoppingCart, Users } from 'lucide-react';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';
import { useToast } from '../lib/hooks';
import type { Analytics, KycStatus, Order, OrderStatus, User } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import Toast from '../components/Toast';
import { Button, Empty, ErrorText, Spinner } from '../components/ui';
import Layout, { PageTitle, Stat } from './Layout';
import OrderCard from './OrderCard';
import { setOrderStatus } from './shared';

const KYC_STYLE: Record<KycStatus, string> = { PENDING: 'bg-amber-50 text-amber-700', APPROVED: 'bg-green-50 text-green-700', REJECTED: 'bg-red-50 text-red-700' };
const NEXT: Partial<Record<OrderStatus, [OrderStatus, string]>> = { PENDING: ['PAID', 'Mark paid (offline)'], PAID: ['CONFIRMED', 'Confirm order'], CONFIRMED: ['SHIPPED', 'Mark dispatched'], SHIPPED: ['DELIVERED', 'Mark delivered'] };
const CANCELLABLE: OrderStatus[] = ['PENDING', 'PAID', 'CONFIRMED'];

export default function AdminDashboard({ user, tab }: { user: User; tab: string }) {
  const analytics = useAsync(() => api<Analytics>('/admin/analytics'));
  const users = useAsync(() => api<User[]>('/admin/users'));
  const orders = useAsync(() => api<Order[]>('/orders'));
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [busy, setBusy] = useState('');
  const [toast, showToast] = useToast();

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try { await fn(); showToast(ok); void analytics.reload(); } catch (e) { showToast(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(''); }
  }
  const setKyc = (u: User, status: KycStatus) => run(`${u.id}:${status}`, async () => {
    const updated = await api<User>(`/admin/users/${u.id}/kyc`, { method: 'PUT', json: { status } });
    users.setData((users.data ?? []).map((x) => x.id === u.id ? updated : x));
  }, `${u.name} ${status.toLowerCase()}`);
  const move = (o: Order, status: OrderStatus) => {
    if (status === 'CANCELLED' && !window.confirm('Cancel this order and release its stock?')) return;
    return run(`${o.id}:${status}`, async () => {
      const updated = await setOrderStatus(o.id, status);
      orders.setData((orders.data ?? []).map((x) => x.id === o.id ? updated : x));
    }, 'Order updated');
  };

  const verifiable = (users.data ?? []).filter((u) => u.role === 'FARMER' || u.role === 'INDUSTRY');
  const shownUsers = filter === 'PENDING' ? verifiable.filter((u) => u.kycStatus === 'PENDING') : users.data ?? [];
  const a = analytics.data;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'users', label: 'Users & KYC', icon: <Users size={18} />, badge: a?.pendingKyc },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={18} />, badge: a?.pendingOrders },
  ];

  let body;
  if (tab === 'users') body = <>
    <PageTitle title="Users & verification" text="Approve farms and businesses before they trade." action={<div className="flex gap-2">{(['PENDING', 'ALL'] as const).map((f) => <Button key={f} variant={filter === f ? 'primary' : 'secondary'} onClick={() => setFilter(f)}>{f === 'PENDING' ? 'Awaiting review' : 'All users'}</Button>)}</div>} />
    <ErrorText>{users.error}</ErrorText>
    {users.loading && !users.data ? <Spinner /> : shownUsers.length ? <div className="overflow-hidden rounded-2xl border bg-white"><ul className="divide-y">{shownUsers.map((u) =>
      <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1"><b className="block truncate">{u.name}{u.businessName && u.businessName !== u.name && <span className="font-normal text-slate-500"> · {u.businessName}</span>}</b><span className="text-sm text-slate-500">{u.email} · {u.role.toLowerCase()}{u.farmLocation && ` · ${u.farmLocation}`}{u.createdAt && ` · joined ${shortDate(u.createdAt)}`}</span></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${KYC_STYLE[u.kycStatus]}`}>{u.kycStatus.toLowerCase()}</span>
        {(u.role === 'FARMER' || u.role === 'INDUSTRY') && <div className="flex gap-2">
          {u.kycStatus !== 'APPROVED' && <Button busy={busy === `${u.id}:APPROVED`} onClick={() => setKyc(u, 'APPROVED')}>Approve</Button>}
          {u.kycStatus !== 'REJECTED' && <Button variant="danger" busy={busy === `${u.id}:REJECTED`} onClick={() => setKyc(u, 'REJECTED')}>Reject</Button>}
        </div>}
      </li>)}</ul></div> : <Empty title={filter === 'PENDING' ? 'No accounts awaiting review' : 'No users yet'} />}
  </>;
  else if (tab === 'orders') body = <>
    <PageTitle title="Orders" text="Confirm payments and oversee fulfilment." />
    <ErrorText>{orders.error}</ErrorText>
    {orders.loading && !orders.data ? <Spinner /> : <div className="grid gap-4 xl:grid-cols-2">{(orders.data ?? []).length ? (orders.data ?? []).map((o) =>
      <OrderCard key={o.id} order={o} showBuyer actions={(NEXT[o.status] || CANCELLABLE.includes(o.status)) && <>
        {o.status === 'PENDING' && <p className="w-full text-xs text-slate-500">Paystack payments confirm automatically. Only mark paid for verified offline transfers.</p>}
        {NEXT[o.status] && <Button busy={busy === `${o.id}:${NEXT[o.status]![0]}`} onClick={() => move(o, NEXT[o.status]![0])}>{NEXT[o.status]![1]}</Button>}
        {CANCELLABLE.includes(o.status) && <Button variant="danger" busy={busy === `${o.id}:CANCELLED`} onClick={() => move(o, 'CANCELLED')}>Cancel</Button>}
      </>} />) : <Empty title="No orders yet" />}</div>}
  </>;
  else body = <>
    <PageTitle title="Platform overview" text={`Signed in as ${user.email}`} />
    <ErrorText>{analytics.error}</ErrorText>
    {!a ? <Spinner /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Revenue" value={naira(a.revenue)} hint="Paid orders" />
      <Stat label="Orders" value={a.orders} hint={`${a.pendingOrders} awaiting payment`} />
      <Stat label="Users" value={a.users} hint={`${a.farmers} farmers`} />
      <Stat label="Live products" value={a.products} hint={`${a.pendingKyc} accounts awaiting KYC`} />
    </div>}
    {a && a.refundsDue > 0 && <p className="mt-6 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{a.refundsDue} cancelled order{a.refundsDue > 1 ? 's were' : ' was'} paid and need{a.refundsDue > 1 ? '' : 's'} a refund. Look for “Refund due” under Orders.</p>}
  </>;

  return <Layout user={user} tabs={tabs} tab={tab}>{body}<Toast message={toast} /></Layout>;
}

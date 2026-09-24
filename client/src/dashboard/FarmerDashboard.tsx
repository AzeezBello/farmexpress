import { useState } from 'react';
import { LayoutDashboard, Package, Pencil, Plus, ShoppingCart, Trash2, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { naira } from '../lib/format';
import { useToast } from '../lib/hooks';
import type { Order, OrderStatus, Product, User } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import Toast from '../components/Toast';
import { FALLBACK_IMAGE } from '../components/ProductCard';
import { Button, Empty, ErrorText, Spinner } from '../components/ui';
import Layout, { PageTitle, Stat } from './Layout';
import OrderCard from './OrderCard';
import ProductForm from './ProductForm';
import { KycBanner, ProfilePanel, setOrderStatus } from './shared';

const NEXT: Partial<Record<OrderStatus, [OrderStatus, string]>> = { PAID: ['CONFIRMED', 'Confirm order'], CONFIRMED: ['SHIPPED', 'Mark dispatched'], SHIPPED: ['DELIVERED', 'Mark delivered'] };
const LOW_STOCK = 10;

export default function FarmerDashboard({ user, tab }: { user: User; tab: string }) {
  const products = useAsync(() => api<Product[]>('/products/mine'));
  const orders = useAsync(() => api<Order[]>('/orders/incoming'));
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [busyId, setBusyId] = useState('');
  const [toast, showToast] = useToast();
  const verified = user.kycStatus === 'APPROVED';
  const myProducts = products.data ?? [];
  const myOrders = orders.data ?? [];
  const ownsAll = (o: Order) => o.items.every((i) => i.product.farmerId === user.id);
  const toFulfil = myOrders.filter((o) => NEXT[o.status] && ownsAll(o));
  const sales = myOrders.filter((o) => ['PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(o.status))
    .reduce((s, o) => s + o.items.filter((i) => i.product.farmerId === user.id).reduce((t, i) => t + Number(i.unitPrice) * i.quantity, 0), 0);

  async function advance(o: Order) {
    const next = NEXT[o.status]; if (!next) return;
    setBusyId(o.id);
    try { const updated = await setOrderStatus(o.id, next[0]); orders.setData(myOrders.map((x) => x.id === o.id ? updated : x)); showToast(`Order ${next[1].toLowerCase().replace('mark ', 'marked ')}`); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not update order'); } finally { setBusyId(''); }
  }
  async function remove(p: Product) {
    if (!window.confirm(`Remove "${p.name}" from the marketplace?`)) return;
    try { await api(`/products/${p.id}`, { method: 'DELETE' }); products.setData(myProducts.filter((x) => x.id !== p.id)); showToast('Listing removed'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not remove listing'); }
  }

  const orderList = (list: Order[]) => list.map((o) => <OrderCard key={o.id} order={o} showBuyer farmerId={user.id}
    actions={NEXT[o.status] ? ownsAll(o) ? <Button busy={busyId === o.id} onClick={() => advance(o)}>{NEXT[o.status]![1]}</Button> : <p className="text-xs text-slate-500">This order includes other farms’ products — FarmExpress operations will coordinate fulfilment.</p>
      : o.status === 'PENDING' ? <p className="text-xs text-slate-500">Stock is reserved. You can start fulfilment once payment is confirmed.</p> : undefined} />);

  const addButton = <Button onClick={() => setEditing('new')} disabled={!verified} title={verified ? undefined : 'Verification required'}><Plus size={17} /> New listing</Button>;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'products', label: 'Products', icon: <Package size={18} /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={18} />, badge: toFulfil.length },
    { id: 'profile', label: 'Profile & KYC', icon: <UserRound size={18} /> },
  ];

  let body;
  if (tab === 'profile') body = <ProfilePanel user={user} />;
  else if ((products.loading && !products.data) || (orders.loading && !orders.data)) body = <Spinner />;
  else if (tab === 'products') body = <>
    <PageTitle title="Products" text="Manage your listings and stock levels." action={addButton} />
    <KycBanner status={user.kycStatus} role={user.role} /><ErrorText>{products.error}</ErrorText>
    {myProducts.length ? <div className="overflow-hidden rounded-2xl border bg-white"><ul className="divide-y">{myProducts.map((p) =>
      <li key={p.id} className="flex items-center gap-4 p-4">
        <img src={p.imageUrl || FALLBACK_IMAGE} alt="" className="h-14 w-14 rounded-xl object-cover" />
        <div className="min-w-0 flex-1"><b className="block truncate">{p.name}</b><span className="text-sm text-slate-500">{naira(p.price)} · {p.category}</span></div>
        <span className={`hidden rounded-full px-2.5 py-1 text-xs font-bold sm:block ${p.quantity === 0 ? 'bg-red-50 text-red-700' : p.quantity < LOW_STOCK ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{p.quantity === 0 ? 'Out of stock' : `${p.quantity} in stock`}</span>
        <button aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)} className="rounded-lg border p-2 hover:bg-slate-50"><Pencil size={16} /></button>
        <button aria-label={`Remove ${p.name}`} onClick={() => remove(p)} className="rounded-lg border p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
      </li>)}</ul></div> : <Empty title="No listings yet" text={verified ? 'Add your first product to start selling.' : 'You can add listings once your farm is verified.'} action={verified ? addButton : undefined} />}
  </>;
  else if (tab === 'orders') body = <>
    <PageTitle title="Orders" text="Orders containing your products." />
    <ErrorText>{orders.error}</ErrorText>
    <div className="grid gap-4 xl:grid-cols-2">{myOrders.length ? orderList(myOrders) : <Empty title="No orders yet" text="Orders for your products will show up here." />}</div>
  </>;
  else body = <>
    <PageTitle title={`Hello, ${user.name.split(' ')[0]}`} text={user.businessName || user.farmLocation || 'Your farm at a glance.'} action={addButton} />
    <KycBanner status={user.kycStatus} role={user.role} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Sales" value={naira(sales)} hint="From paid orders" />
      <Stat label="To fulfil" value={toFulfil.length} hint="Paid orders awaiting action" />
      <Stat label="Live listings" value={myProducts.filter((p) => p.quantity > 0).length} hint={`${myProducts.length} total`} />
      <Stat label="Low stock" value={myProducts.filter((p) => p.quantity < LOW_STOCK).length} hint={`Under ${LOW_STOCK} units`} />
    </div>
    <h2 className="mb-3 mt-8 font-bold">Needs your attention</h2>
    <div className="grid gap-4 xl:grid-cols-2">{toFulfil.length ? orderList(toFulfil.slice(0, 4)) : <Empty title="You're all caught up" text="No paid orders are waiting on you." />}</div>
  </>;

  return <Layout user={user} tabs={tabs} tab={tab}>
    {body}
    {editing && <ProductForm product={editing === 'new' ? undefined : editing} defaultLocation={user.farmLocation} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void products.reload(); showToast('Listing saved'); }} />}
    <Toast message={toast} />
  </Layout>;
}

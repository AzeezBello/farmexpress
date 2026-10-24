import { useEffect, useState } from 'react';
import { ClipboardList, ExternalLink, FileText, LayoutDashboard, RotateCcw, Search, ShoppingCart, Truck, Users } from 'lucide-react';
import { api, resolveAssetUrl } from '../lib/api';
import { dateTime, KYC_DOC_LABELS, naira, shortDate, shortId } from '../lib/format';
import { useToast } from '../lib/hooks';
import type { Analytics, AuditLogItem, KycStatus, Order, OrderStatus, Paginated, User } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import Toast from '../components/Toast';
import { Button, Empty, ErrorText, Pagination, Spinner } from '../components/ui';
import Layout, { PageTitle, Stat } from './Layout';
import OrderCard from './OrderCard';
import { DispatchModal, setOrderStatus } from './shared';

const KYC_STYLE: Record<KycStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
};
const NEXT: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
  PENDING: ['PAID', 'Mark paid (offline)'],
  PAID: ['CONFIRMED', 'Confirm order'],
  CONFIRMED: ['SHIPPED', 'Mark dispatched'],
  SHIPPED: ['DELIVERED', 'Mark delivered'],
};
const CANCELLABLE: OrderStatus[] = ['PENDING', 'PAID', 'CONFIRMED'];
const USERS_PER_PAGE = 10;
const ORDERS_PER_PAGE = 6;
const AUDIT_PER_PAGE = 15;

export default function AdminDashboard({ user, tab }: { user: User; tab: string }) {
  const analytics = useAsync(() => api<Analytics>('/admin/analytics'));
  const users = useAsync(() => api<User[]>('/admin/users'));
  const orders = useAsync(() => api<Order[]>('/orders'));

  const [userFilter, setUserFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);

  const [orderFilter, setOrderFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [orderPage, setOrderPage] = useState(1);
  const [dispatching, setDispatching] = useState<{ order: Order; mode: 'dispatch' | 'update' } | null>(null);

  const [auditTarget, setAuditTarget] = useState<string>('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditData, setAuditData] = useState<Paginated<AuditLogItem> | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');

  const [busy, setBusy] = useState('');
  const [toast, showToast] = useToast();

  useEffect(() => {
    if (tab !== 'audit') return;
    let active = true;
    setAuditLoading(true);
    const qs = new URLSearchParams({
      page: String(auditPage),
      limit: String(AUDIT_PER_PAGE),
      ...(auditTarget ? { targetType: auditTarget } : {}),
    });
    api<Paginated<AuditLogItem>>(`/admin/audit-logs?${qs}`)
      .then((res) => {
        if (active) {
          setAuditData(res);
          setAuditError('');
        }
      })
      .catch((e) => {
        if (active) setAuditError(e instanceof Error ? e.message : 'Could not load audit logs');
      })
      .finally(() => {
        if (active) setAuditLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, auditPage, auditTarget]);

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try {
      await fn();
      showToast(ok);
      void analytics.reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy('');
    }
  }

  const setKyc = (u: User, status: KycStatus) => {
    let note: string | undefined;
    if (status === 'REJECTED') {
      const input = window.prompt(`Reason for rejecting ${u.name}'s verification (optional):`, u.kycNote || '');
      if (input === null) return;
      note = input.trim() || undefined;
    }
    return run(
      `${u.id}:${status}`,
      async () => {
        const updated = await api<User>(`/admin/users/${u.id}/kyc`, { method: 'PUT', json: { status, note } });
        users.setData((users.data ?? []).map((x) => (x.id === u.id ? updated : x)));
      },
      `${u.name} ${status.toLowerCase()}`,
    );
  };

  const move = (o: Order, status: OrderStatus) => {
    if (status === 'SHIPPED') {
      setDispatching({ order: o, mode: 'dispatch' });
      return;
    }
    if (status === 'CANCELLED' && !window.confirm('Cancel this order and release its stock?')) return;
    return run(
      `${o.id}:${status}`,
      async () => {
        const updated = await setOrderStatus(o.id, status);
        orders.setData((orders.data ?? []).map((x) => (x.id === o.id ? updated : x)));
      },
      'Order updated',
    );
  };

  const issueRefund = (o: Order) => {
    const defaultReason = o.status === 'CANCELLED' ? 'Order cancelled — refund issued' : 'Cancelled & refunded by admin';
    const reason = window.prompt(`Issue refund of ${naira(o.totalPrice)} for order ${shortId(o.id)}?\nEnter refund note:`, defaultReason);
    if (reason === null) return;
    return run(
      `${o.id}:REFUND`,
      async () => {
        const updated = await api<Order>(`/payments/orders/${o.id}/refund`, {
          method: 'POST',
          json: { reason: reason.trim() || undefined },
        });
        orders.setData((orders.data ?? []).map((x) => (x.id === o.id ? updated : x)));
      },
      'Refund processed',
    );
  };

  const allUsers = users.data ?? [];
  const verifiable = allUsers.filter((u) => u.role === 'FARMER' || u.role === 'INDUSTRY');
  const filteredUsers = (userFilter === 'PENDING' ? verifiable.filter((u) => u.kycStatus === 'PENDING') : allUsers).filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return `${u.name} ${u.email} ${u.businessName ?? ''} ${u.farmLocation ?? ''}`.toLowerCase().includes(q);
  });
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const pagedUsers = filteredUsers.slice((safeUserPage - 1) * USERS_PER_PAGE, safeUserPage * USERS_PER_PAGE);

  const allOrders = orders.data ?? [];
  const filteredOrders = orderFilter === 'ALL' ? allOrders : allOrders.filter((o) => o.status === orderFilter);
  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const pagedOrders = filteredOrders.slice((safeOrderPage - 1) * ORDERS_PER_PAGE, safeOrderPage * ORDERS_PER_PAGE);

  const a = analytics.data;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'users', label: 'Users & KYC', icon: <Users size={18} />, badge: a?.pendingKyc },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={18} />, badge: a?.pendingOrders },
    { id: 'audit', label: 'Audit log', icon: <ClipboardList size={18} /> },
  ];

  let body;
  if (tab === 'users')
    body = (
      <>
        <PageTitle
          title="Users & verification"
          text="Review KYC documents and approve farms and businesses before they trade."
          action={
            <div className="flex gap-2">
              {(['PENDING', 'ALL'] as const).map((f) => (
                <Button
                  key={f}
                  variant={userFilter === f ? 'primary' : 'secondary'}
                  onClick={() => {
                    setUserFilter(f);
                    setUserPage(1);
                  }}
                >
                  {f === 'PENDING' ? 'Awaiting review' : 'All users'}
                </Button>
              ))}
            </div>
          }
        />
        <div className="mb-4">
          <label className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-2.5 shadow-sm focus-within:border-green-600">
            <Search size={18} className="text-slate-400" />
            <input
              type="search"
              aria-label="Search users"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserPage(1);
              }}
              placeholder="Search by name, email, farm or company..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <ErrorText>{users.error}</ErrorText>
        {users.loading && !users.data ? (
          <Spinner />
        ) : pagedUsers.length ? (
          <>
            <div className="overflow-hidden rounded-2xl border bg-white">
              <ul className="divide-y">
                {pagedUsers.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <b className="block truncate">
                        {u.name}
                        {u.businessName && u.businessName !== u.name && <span className="font-normal text-slate-500"> · {u.businessName}</span>}
                      </b>
                      <span className="block text-sm text-slate-500">
                        {u.email} · {u.role.toLowerCase()}
                        {u.farmLocation && ` · ${u.farmLocation}`}
                        {u.createdAt && ` · joined ${shortDate(u.createdAt)}`}
                      </span>
                      {(u.kycDocumentUrl || u.kycNote) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {u.kycDocumentType && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                              <FileText size={12} /> {KYC_DOC_LABELS[u.kycDocumentType] ?? u.kycDocumentType}
                            </span>
                          )}
                          {u.kycDocumentUrl && (
                            <a
                              href={resolveAssetUrl(u.kycDocumentUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 font-bold text-green-700 hover:bg-green-100"
                            >
                              View KYC document <ExternalLink size={12} />
                            </a>
                          )}
                          {u.kycSubmittedAt && <span className="text-slate-400">Submitted {shortDate(u.kycSubmittedAt)}</span>}
                          {u.kycNote && <span className="text-red-600">Note: “{u.kycNote}”</span>}
                        </div>
                      )}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${KYC_STYLE[u.kycStatus]}`}>{u.kycStatus.toLowerCase()}</span>
                    {(u.role === 'FARMER' || u.role === 'INDUSTRY') && (
                      <div className="flex gap-2">
                        {u.kycStatus !== 'APPROVED' && (
                          <Button busy={busy === `${u.id}:APPROVED`} onClick={() => setKyc(u, 'APPROVED')}>
                            Approve
                          </Button>
                        )}
                        {u.kycStatus !== 'REJECTED' && (
                          <Button variant="danger" busy={busy === `${u.id}:REJECTED`} onClick={() => setKyc(u, 'REJECTED')}>
                            Reject
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <Pagination page={safeUserPage} totalPages={totalUserPages} total={filteredUsers.length} pageSize={USERS_PER_PAGE} onPageChange={setUserPage} />
          </>
        ) : (
          <Empty title={userFilter === 'PENDING' ? 'No accounts awaiting review' : 'No matching users'} />
        )}
      </>
    );
  else if (tab === 'orders')
    body = (
      <>
        <PageTitle
          title="Orders"
          text="Confirm payments, manage delivery tracking, and issue Paystack refunds."
          action={
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', 'PENDING', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setOrderFilter(st);
                    setOrderPage(1);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    orderFilter === st ? 'bg-green-700 text-white' : 'border bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          }
        />
        <ErrorText>{orders.error}</ErrorText>
        {orders.loading && !orders.data ? (
          <Spinner />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              {pagedOrders.length ? (
                pagedOrders.map((o) => {
                  const canRefund = o.payment?.status === 'SUCCESSFUL' && ['CANCELLED', 'PAID', 'CONFIRMED'].includes(o.status);
                  return (
                    <OrderCard
                      key={o.id}
                      order={o}
                      showBuyer
                      actions={
                        (NEXT[o.status] || CANCELLABLE.includes(o.status) || canRefund || o.status === 'SHIPPED') && (
                          <>
                            {o.status === 'PENDING' && (
                              <p className="w-full text-xs text-slate-500">
                                Paystack payments confirm automatically. Only mark paid for verified offline transfers.
                              </p>
                            )}
                            {NEXT[o.status] && (
                              <Button busy={busy === `${o.id}:${NEXT[o.status]![0]}`} onClick={() => move(o, NEXT[o.status]![0])}>
                                {NEXT[o.status]![1]}
                              </Button>
                            )}
                            {o.status === 'SHIPPED' && (
                              <Button variant="secondary" onClick={() => setDispatching({ order: o, mode: 'update' })}>
                                <Truck size={15} /> Update tracking
                              </Button>
                            )}
                            {CANCELLABLE.includes(o.status) && (
                              <Button variant="danger" busy={busy === `${o.id}:CANCELLED`} onClick={() => move(o, 'CANCELLED')}>
                                Cancel
                              </Button>
                            )}
                            {canRefund && (
                              <Button variant="danger" busy={busy === `${o.id}:REFUND`} onClick={() => issueRefund(o)}>
                                <RotateCcw size={15} /> {o.status === 'CANCELLED' ? 'Issue refund' : 'Cancel & refund'}
                              </Button>
                            )}
                          </>
                        )
                      }
                    />
                  );
                })
              ) : (
                <Empty title="No orders found" />
              )}
            </div>
            <Pagination page={safeOrderPage} totalPages={totalOrderPages} total={filteredOrders.length} pageSize={ORDERS_PER_PAGE} onPageChange={setOrderPage} />
          </>
        )}
      </>
    );
  else if (tab === 'audit')
    body = (
      <>
        <PageTitle
          title="Audit log"
          text="Immutable trail of administrative actions, KYC decisions, order transitions, and refunds."
          action={
            <div className="flex flex-wrap gap-1.5">
              {(['', 'USER', 'ORDER', 'PRODUCT', 'PAYMENT'] as const).map((t) => (
                <button
                  key={t || 'ALL'}
                  type="button"
                  onClick={() => {
                    setAuditTarget(t);
                    setAuditPage(1);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    auditTarget === t ? 'bg-green-700 text-white' : 'border bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t || 'All events'}
                </button>
              ))}
            </div>
          }
        />
        <ErrorText>{auditError}</ErrorText>
        {auditLoading && !auditData ? (
          <Spinner />
        ) : auditData && auditData.items.length ? (
          <>
            <div tabIndex={0} role="region" aria-labelledby="audit-table-caption" className="table-wrapper rounded-2xl border bg-white">
              <table>
                <caption id="audit-table-caption" className="sr-only">
                  Platform security and operational audit log
                </caption>
                <thead className="border-b bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {auditData.items.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <th className="px-4 py-3 text-left font-mono text-xs font-bold text-green-800">{log.action}</th>
                      <td className="px-4 py-3 text-xs text-slate-600">{log.actor?.name || log.actorEmail || 'System'}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                        {log.targetType} · <span className="font-mono">{shortId(log.targetId)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-800">{log.summary}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{dateTime(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={auditData.page}
              totalPages={auditData.totalPages}
              total={auditData.total}
              pageSize={auditData.pageSize}
              onPageChange={setAuditPage}
            />
          </>
        ) : (
          <Empty title="No audit log entries yet" text="Actions across KYC, orders, products, and refunds will be recorded here." />
        )}
      </>
    );
  else
    body = (
      <>
        <PageTitle title="Platform overview" text={`Signed in as ${user.email}`} />
        <ErrorText>{analytics.error}</ErrorText>
        {!a ? (
          <Spinner />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Revenue" value={naira(a.revenue)} hint="Paid orders" />
            <Stat label="Orders" value={a.orders} hint={`${a.pendingOrders} awaiting payment`} />
            <Stat label="Users" value={a.users} hint={`${a.farmers} farmers`} />
            <Stat label="Live products" value={a.products} hint={`${a.pendingKyc} accounts awaiting KYC`} />
          </div>
        )}
        {a && a.refundsDue > 0 && (
          <p className="mt-6 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {a.refundsDue} cancelled order{a.refundsDue > 1 ? 's were' : ' was'} paid and need{a.refundsDue > 1 ? '' : 's'} a refund. Open the Orders tab and click “Issue refund”.
          </p>
        )}
      </>
    );

  return (
    <Layout user={user} tabs={tabs} tab={tab}>
      {body}
      {dispatching && (
        <DispatchModal
          order={dispatching.order}
          mode={dispatching.mode}
          onClose={() => setDispatching(null)}
          onSaved={(updated) => {
            orders.setData((orders.data ?? []).map((x) => (x.id === updated.id ? updated : x)));
            setDispatching(null);
            showToast(dispatching.mode === 'dispatch' ? 'Order marked dispatched' : 'Tracking updated');
          }}
        />
      )}
      <Toast message={toast} />
    </Layout>
  );
}

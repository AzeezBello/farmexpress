import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { navigate } from '../lib/hooks';
import type { NotificationItem } from '../lib/types';

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const list = await api<NotificationItem[]>('/notifications');
      setItems(list);
    } catch {
      // Offline or unauthenticated
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.readAt).length;

  async function markRead(n: NotificationItem) {
    if (!n.readAt) {
      try {
        const updated = await api<NotificationItem>(`/notifications/${n.id}/read`, { method: 'PATCH' });
        setItems((prev) => prev.map((x) => (x.id === n.id ? updated : x)));
      } catch {
        // Ignore transient network errors
      }
    }
    if (n.orderId) {
      setOpen(false);
      navigate('/dashboard/orders');
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        className="relative rounded-xl border border-slate-200 p-2 hover:bg-slate-50"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-xs font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border bg-white shadow-2xl sm:w-96"
        >
          <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
            <div>
              <b className="text-sm">Notifications</b>
              {unread > 0 && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">{unread} new</span>}
            </div>
            {unread > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline disabled:opacity-50"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.length === 0 ? (
              <li className="p-6 text-center text-sm text-slate-500">No notifications yet.</li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n)}
                    className={`w-full p-3.5 text-left transition hover:bg-slate-50 ${n.readAt ? 'bg-white' : 'bg-green-50/50'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <b className="text-xs font-bold text-slate-900">{n.title}</b>
                      {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-green-600" aria-label="Unread" />}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{n.body}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{dateTime(n.createdAt)}</span>
                      {n.emailSent && (
                        <span className="inline-flex items-center gap-1 text-slate-400" title="Email notification dispatched">
                          <Mail size={11} /> Email sent
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

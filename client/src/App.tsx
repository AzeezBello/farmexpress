import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { navigate, useHashRoute } from './lib/hooks';
import { flash, verifyPayment } from './lib/payments';
import Storefront from './Storefront';
import Dashboard from './dashboard/Dashboard';

function Shell() {
  const route = useHashRoute();
  const { user, loading } = useAuth();
  const paying = usePaymentReturn(user, loading);
  const wantsDashboard = route.startsWith('/dashboard');
  if (paying) return <FullScreen text="Confirming your payment…" />;
  if (wantsDashboard && loading) return <FullScreen />;
  if (wantsDashboard && user) return <Dashboard user={user} tab={route.split('/')[2] || 'overview'} />;
  return <Storefront promptSignIn={wantsDashboard} />;
}

const FullScreen = ({ text }: { text?: string }) => <div className="grid min-h-screen place-content-center justify-items-center gap-3 text-green-700"><Loader2 className="animate-spin" />{text && <p className="text-sm font-semibold text-slate-600">{text}</p>}</div>;

// Paystack sends buyers back to APP_URL/?trxref=…&reference=…; confirm the payment, then show their orders.
function usePaymentReturn(user: unknown, authLoading: boolean) {
  const [reference] = useState(() => { const p = new URLSearchParams(window.location.search); return p.get('reference') || p.get('trxref'); });
  const [pending, setPending] = useState(!!reference);
  useEffect(() => {
    if (!reference || authLoading) return;
    const done = (message: string) => {
      flash.set(message);
      window.history.replaceState(null, '', window.location.pathname);
      // Drop the loading screen only once the route has changed, so the storefront never mounts in between.
      const onHash = () => { window.removeEventListener('hashchange', onHash); setPending(false); };
      window.addEventListener('hashchange', onHash);
      navigate('/dashboard/orders');
    };
    if (!user) return done('Sign in to see your payment status.');
    verifyPayment(reference)
      .then((r) => done(r.status !== 'success' ? 'Payment was not completed. You can try again with “Pay now”.'
        : r.outcome === 'refund-due' ? 'We received your payment, but this order had already been cancelled. Our team will refund you.'
        : 'Payment received — thank you! Your order is confirmed.'))
      .catch((e) => done(e instanceof Error ? e.message : 'Could not confirm payment'));
  }, [reference, authLoading, user]);
  return pending;
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}

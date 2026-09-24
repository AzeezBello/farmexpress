import { useCallback, useEffect, useRef, useState } from 'react';
import { flash } from './payments';

export function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => { const on = () => setRoute(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return route;
}
export const navigate = (route: string) => { window.location.hash = route; };

export function useToast() {
  const [toast, setToast] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = useCallback((msg: string, ms = 2600) => { setToast(msg); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(''), ms); }, []);
  // Pick up a message left before a navigation (e.g. after checkout or returning from Paystack).
  useEffect(() => { const m = flash.take(); if (m) show(m, 5000); }, [show]);
  return [toast, show] as const;
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
}

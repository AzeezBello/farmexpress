import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data on mount and exposes reload(); keeps the last good data while reloading.
export function useAsync<T>(load: () => Promise<T>) {
  const loader = useRef(load);
  loader.current = load;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await loader.current()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, loading, reload };
}

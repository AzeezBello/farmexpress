import {
  useEffect,
  useId,
  type ReactNode,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ButtonHTMLAttributes,
} from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { STATUS_LABEL, STATUS_STYLE } from '../lib/format';
import type { OrderStatus } from '../lib/types';

export function Modal({ title, eyebrow, onClose, children, wide }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/60 sm:place-items-center sm:p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>{eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-orange-600">{eyebrow}</p>}<h2 className="text-2xl font-black">{title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border p-2 hover:bg-slate-50"><X size={20} /></button>
      </div>
      {children}
    </div>
  </div>;
}

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/15';

export function Field({ label, hint, id: givenId, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = givenId || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const isIdentifier = props.type === 'email' || props.type === 'url' || props.type === 'search';
  return <div className="block">
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
    <input
      id={id}
      aria-describedby={hintId}
      autoCorrect={isIdentifier ? 'off' : props.autoCorrect}
      autoCapitalize={isIdentifier ? 'off' : props.autoCapitalize}
      spellCheck={isIdentifier ? false : props.spellCheck}
      className={fieldClass}
      {...props}
    />
    {hint && <span id={hintId} className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </div>;
}

export function TextArea({ label, hint, id: givenId, ...props }: { label: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const id = givenId || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  return <div className="block">
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
    <textarea id={id} aria-describedby={hintId} className={fieldClass} rows={3} {...props} />
    {hint && <span id={hintId} className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </div>;
}

export function Select({ label, children, id: givenId, ...props }: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const id = givenId || autoId;
  return <div className="block">
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
    <select id={id} className={fieldClass} {...props}>{children}</select>
  </div>;
}

export function Button({ busy, children, variant = 'primary', className = '', ...props }: { busy?: boolean; variant?: 'primary' | 'secondary' | 'danger' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = { primary: 'bg-green-700 text-white hover:bg-green-800', secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50', danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50' }[variant];
  return <button {...props} disabled={busy || props.disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}>{busy && <Loader2 size={16} className="animate-spin" />}{children}</button>;
}

export const ErrorText = ({ children }: { children?: string }) => children ? <p role="alert" aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{children}</p> : null;

export const StatusBadge = ({ status }: { status: OrderStatus }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;

export const Empty = ({ title, text, action }: { title: string; text?: string; action?: ReactNode }) =>
  <div className="rounded-2xl border border-dashed bg-white p-10 text-center"><h3 className="font-bold">{title}</h3>{text && <p className="mt-1 text-sm text-slate-500">{text}</p>}{action && <div className="mt-4">{action}</div>}</div>;

export const Spinner = () => <div className="grid place-items-center p-10 text-slate-400"><Loader2 className="animate-spin" /></div>;

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-sm">
      <span className="text-slate-500">
        Showing <b className="text-slate-900">{start}–{end}</b> of <b className="text-slate-900">{total}</b>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="px-2 font-semibold text-slate-700">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}

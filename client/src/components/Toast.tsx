export default function Toast({ message }: { message: string }) {
  return <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">{message && <div className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-xl">{message}</div>}</div>;
}

export function ProgressBar({
  value,
  label
}: {
  value: number;
  label: string;
}) {
  return <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-slate-100">
    <div className="h-full rounded-full bg-brand-500 transition-all" style={{
      width: `${Math.min(100, Math.max(0, value))}%`
    }} />
  </div>;
}

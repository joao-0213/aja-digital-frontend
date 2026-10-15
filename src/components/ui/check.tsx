'use client';

export function Check({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} className="size-4 accent-brand-600" />
    {label}
  </label>;
}

import { Check } from 'lucide-react';
import type { Subject } from '@/models';

export type SubjectColor = Subject['color'];

export const subjectColors: readonly {
  value: SubjectColor;
  label: string;
  background: string;
  color: string;
  swatch: string;
}[] = [
  { value: 'violet', label: 'Roxo', background: '#f2e5f7', color: '#75218d', swatch: '#8f2db4' },
  { value: 'blue', label: 'Azul', background: '#e8eff8', color: '#345b88', swatch: '#345b88' },
  { value: 'amber', label: 'Âmbar', background: '#faf0d9', color: '#805b18', swatch: '#b47b19' },
  { value: 'green', label: 'Verde', background: '#e5f1ea', color: '#32634a', swatch: '#32634a' }
] as const;

export const subjectCovers: Record<SubjectColor, { background: string; color: string }> = {
  violet: { background: '#f2e5f7', color: '#75218d' },
  blue: { background: '#e8eff8', color: '#345b88' },
  amber: { background: '#faf0d9', color: '#805b18' },
  green: { background: '#e5f1ea', color: '#32634a' }
};

export function subjectColorLabel(value: SubjectColor) {
  return subjectColors.find((item) => item.value === value)?.label ?? value;
}

export function SubjectColorPicker({
  value,
  onChange,
  disabled
}: {
  value: SubjectColor;
  onChange: (value: SubjectColor) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-3 text-sm font-medium text-slate-700">Cor da disciplina</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {subjectColors.map((item) => {
          const selected = value === item.value;
          return (
            <label key={item.value} className="cursor-pointer">
              <input
                type="radio"
                name="subject-color"
                value={item.value}
                checked={selected}
                onChange={() => onChange(item.value)}
                className="peer sr-only"
              />
              <span
                style={
                  selected
                    ? { background: item.background, borderColor: item.color, color: item.color }
                    : undefined
                }
                className="flex min-h-11 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 peer-disabled:opacity-50"
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full border border-black/10"
                  style={{ background: item.swatch, color: '#ffffff' }}
                >
                  {selected && <Check className="size-3.5" strokeWidth={2.5} />}
                </span>
                <span>{item.label}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

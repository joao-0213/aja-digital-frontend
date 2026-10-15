import { Atom, BookOpen, Calculator, FlaskConical, Globe, GraduationCap, Landmark, Languages, Leaf, Palette } from 'lucide-react';
import { type Subject, type SubjectIcon } from '@/models';

export const subjectIcons = [
  { value: 'book', label: 'Livro', Icon: BookOpen },
  { value: 'calculator', label: 'Matemática', Icon: Calculator },
  { value: 'atom', label: 'Física', Icon: Atom },
  { value: 'flask', label: 'Química', Icon: FlaskConical },
  { value: 'leaf', label: 'Biologia', Icon: Leaf },
  { value: 'globe', label: 'Geografia', Icon: Globe },
  { value: 'languages', label: 'Idiomas', Icon: Languages },
  { value: 'landmark', label: 'História', Icon: Landmark },
  { value: 'palette', label: 'Artes', Icon: Palette },
  { value: 'graduation', label: 'Educação', Icon: GraduationCap }
] as const;

export function resolveSubjectIcon(subject: Pick<Subject, 'icon' | 'name'>) {
  const selected = subjectIcons.find(item => item.value === subject.icon);
  if (selected) return selected;
  const name = subject.name.trim().toLocaleLowerCase('pt-BR');
  const inferred = subjectIcons.find(item => item.label.toLocaleLowerCase('pt-BR') === name);
  if (inferred) return inferred;
  if (name === 'língua portuguesa' || name === 'português') return subjectIcons.find(item => item.value === 'languages')!;
  return subjectIcons[0];
}

export function SubjectIconPicker({ value, onChange, disabled }: { value: SubjectIcon; onChange: (value: SubjectIcon) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled}><legend className="mb-3 text-sm font-medium">Ícone da disciplina</legend><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
    {subjectIcons.map(item => <label key={item.value} className="cursor-pointer">
      <input type="radio" name="subject-icon" value={item.value} checked={value === item.value} onChange={() => onChange(item.value)} className="peer sr-only" />
      <span className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 p-2 text-slate-600 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 peer-disabled:opacity-50"><item.Icon aria-hidden="true" className="size-6" strokeWidth={1.7} /><span className="text-xs">{item.label}</span></span>
    </label>)}
  </div></fieldset>;
}

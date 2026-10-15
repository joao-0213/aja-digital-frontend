import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function Empty({
  title = 'Nada por aqui ainda',
  description = 'Novos conteúdos aparecerão aqui.',
  action
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
    <div className="mb-4 rounded-2xl bg-brand-50 p-4">
      <Inbox className="size-7 text-brand-500" />
    </div>
    <h2 className="font-semibold text-slate-800">
      {title}
    </h2>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
      {description}
    </p>
    {action && <div className="mt-5">
      {action}
    </div>}
  </div>;
}

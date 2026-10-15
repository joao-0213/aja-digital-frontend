import { type ReactNode } from 'react';

export function PageHeading({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0 w-full sm:w-auto">
      {eyebrow && <p className="mb-2 text-sm font-medium text-slate-500">
        {eyebrow}
      </p>}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {title}
      </h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>}
    </div>
    {action}
  </div>;
}

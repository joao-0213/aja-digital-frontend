'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { Avatar, Button, Dialog, Skeleton, ErrorState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { roleLabels } from '@/lib/labels';
import { nav, navGroupsForRole, navLabelForRole } from './navigation';
import { Logo } from '@/components/shared/logo';
const publicRoutes = new Set(['/login', '/cadastro', '/recuperar-senha']);

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname().replace(/\/$/, '') || '/';
  const router = useRouter();
  const { user, status, error, client, sessionKey } = useSession();
  const [mobile, setMobile] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const sidebarExpanded = sidebarHovered || sidebarFocused;
  const auth = publicRoutes.has(path);
  useEffect(() => {
    if (!auth && status === 'anonymous') router.replace('/login');
  }, [auth, status, router]);
  if (auth) return <>{children}</>;
  if (status === 'loading') return <main className="mx-auto max-w-3xl p-8"><Skeleton /></main>;
  if (status === 'error') return <main className="mx-auto max-w-3xl p-8"><ErrorState message={error?.message ?? 'Não foi possível consultar sua sessão.'} retry={() => void client.refresh()} /><Link href="/login" className="mt-6 inline-flex min-h-11 items-center font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Voltar ao login</Link></main>;
  if (!user) return <main className="mx-auto max-w-3xl p-8"><p role="status">Entre na sua conta para continuar.</p><Link href="/login" className="mt-6 inline-flex min-h-11 items-center font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Entrar</Link></main>;
  const role = user.role;
  const navigation = (compact = false, desktop = false) => <>
    <div className="mb-8 shrink-0 px-4"><Logo symbolOnly={compact} /></div>
    <nav id={desktop ? 'desktop-navigation' : undefined} aria-label="Navegação principal" className={cn('space-y-6', desktop ? 'app-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pl-3 pr-0.5' : 'px-3')}>
      {navGroupsForRole(role).map((group, index) => {
        const items = nav.filter((item, i) => (index === 0 ? i < 4 : index === 1 ? i >= 4 && i < 7 : i >= 7) && (!item.staff || role !== 'student') && (!item.admin || role === 'admin'));
        if (!items.length) return null;
        return <div key={group}><p aria-hidden={desktop && compact} className={cn('mb-2 h-4 whitespace-nowrap px-3 text-xs font-medium text-slate-500', desktop && 'app-sidebar-label')}>{group}</p><div className="space-y-1">{items.map(item => {
          const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
          const label = navLabelForRole(item, role);
          return <Link key={item.href} href={item.href} onClick={() => setMobile(false)} title={compact ? label : undefined} aria-label={label} aria-current={active ? 'page' : undefined} className={cn('min-h-11 items-center rounded-lg py-2.5 text-sm transition-colors', desktop ? 'grid grid-cols-[55px_minmax(0,1fr)]' : 'flex gap-3 px-[18px]', active ? 'bg-brand-100 font-semibold text-brand-700' : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900')}><item.icon aria-hidden="true" className={cn('size-[18px] shrink-0', desktop && 'justify-self-center')} strokeWidth={1.8} /><span aria-hidden={desktop && compact} className={cn('min-w-0 overflow-hidden whitespace-nowrap', desktop && 'app-sidebar-label')}>{label}</span></Link>;
        })}</div></div>;
      })}
    </nav>
    <div className="mt-auto shrink-0 px-4 pt-8"><Link href="/perfil" aria-label={`${user.name} · Ver perfil`} title={compact ? `${user.name} · Ver perfil` : undefined} onClick={() => setMobile(false)} className={cn('items-center gap-3 border-t border-slate-100 py-5', desktop ? 'grid grid-cols-[48px_minmax(0,1fr)]' : 'flex')}><span className={desktop ? 'flex justify-center' : undefined}><Avatar name={user.name} /></span><div aria-hidden={desktop && compact} className={cn('min-w-0 overflow-hidden whitespace-nowrap', desktop && 'app-sidebar-label')}><p className="truncate text-sm font-semibold">{user.name}</p><p className="text-xs text-slate-500">{roleLabels[role]} · Ver perfil</p></div></Link></div>
  </>;
  return <div className="min-h-dvh">
    <a href="#main" className="sr-only z-[100] rounded bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Pular para o conteúdo</a>
    <aside aria-label="Barra lateral" data-expanded={sidebarExpanded} onPointerEnter={event => { if (event.pointerType !== 'touch') setSidebarHovered(true); }} onPointerLeave={() => setSidebarHovered(false)} onPointerDown={() => setSidebarFocused(false)} onFocusCapture={event => { if (event.target.matches(':focus-visible')) setSidebarFocused(true); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSidebarFocused(false); }} onKeyDown={event => { if (event.key === 'Escape') { setSidebarHovered(false); setSidebarFocused(false); document.getElementById('main')?.focus({ preventScroll: true }); } }} className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-slate-200/80 bg-white pt-8 transition-[width,box-shadow] duration-200 lg:flex', sidebarExpanded ? 'w-60 shadow-xl shadow-slate-900/10' : 'w-20')}>{navigation(!sidebarExpanded, true)}</aside>
    <Dialog open={mobile} onClose={() => setMobile(false)} title="Navegação"><div className="flex flex-col">{navigation()}</div></Dialog>
    <div className="lg:pl-20">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" className="-ml-2 px-2" aria-label="Abrir menu" aria-expanded={mobile} aria-haspopup="dialog" onClick={() => setMobile(true)}><Menu aria-hidden="true" className="size-5" /></Button>
        <Logo compact />
        <Link href="/perfil" aria-label={`${user.name} · Ver perfil`}><Avatar name={user.name} size="sm" /></Link>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-12 pt-6 sm:px-8 lg:py-9 xl:px-10">
        <div key={sessionKey}>{children}</div>
      </main>
    </div>
  </div>;
}

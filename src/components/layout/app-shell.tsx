'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, LayoutDashboard, GraduationCap, MessageSquare, CalendarDays, LibraryBig, ClipboardCheck, Users, Bell, Menu, LogOut, Settings2, FlaskConical, ListChecks, type LucideIcon } from 'lucide-react';
import type { Role } from '@/models';
import { useApp } from '@/components/providers';
import { Avatar, Button, Dialog, Select, Skeleton, ErrorState } from '@/components/ui';
import { cn, roleLabels } from '@/lib/utils';
import { useMockQuery } from '@/hooks/use-mock-query';
import { simulateNextFailure } from '@/mocks/api';
const nav: {
  href: string;
  label: string;
  icon: LucideIcon;
  staff?: boolean;
  admin?: boolean;
}[] = [{
  href: '/',
  label: 'Meu painel',
  icon: LayoutDashboard
}, {
  href: '/disciplinas',
  label: 'Minhas disciplinas',
  icon: BookOpen
}, {
  href: '/questionarios',
  label: 'Questionários',
  icon: ClipboardCheck
}, {
  href: '/questoes',
  label: 'Banco de questões',
  icon: LibraryBig
}, {
  href: '/forum',
  label: 'Fórum de dúvidas',
  icon: MessageSquare
}, {
  href: '/calendario',
  label: 'Calendário',
  icon: CalendarDays
}, {
  href: '/avisos',
  label: 'Mural de avisos',
  icon: Bell
}, {
  href: '/turmas',
  label: 'Turmas',
  icon: GraduationCap,
  staff: true
}, {
  href: '/alunos',
  label: 'Alunos',
  icon: Users,
  staff: true
}, {
  href: '/frequencia',
  label: 'Frequência',
  icon: ListChecks,
  staff: true
}, {
  href: '/usuarios',
  label: 'Usuários e cargos',
  icon: Settings2,
  admin: true
}];
export function Logo({
  inverted = false,
  symbolOnly = false
}: {
  inverted?: boolean;
  symbolOnly?: boolean;
}) {
  return <Link href="/" className="inline-flex items-center gap-2.5" aria-label="AJA Digital — início">
    <img src="/brand/aja-symbol.svg" alt="" width={48} height={48} className="size-12 shrink-0" />
    <span aria-hidden={symbolOnly} className={cn('app-sidebar-label flex shrink-0 flex-col', symbolOnly && 'opacity-0')}><span className={cn('flex items-baseline gap-2', inverted ? 'text-white' : 'text-brand-900')}><span className="aja-wordmark">AJA</span><span className="text-sm font-medium tracking-wide">digital</span></span><span className={cn('mt-1 text-[10px] tracking-[.08em]', inverted ? 'text-brand-100' : 'text-slate-500')}></span></span>
  </Link>;
}
export function AppShell({
  children
}: {
  children: ReactNode;
}) {
  const rawPath = usePathname();
  const path = rawPath.replace(/\/$/, '') || '/';
  const router = useRouter();
  const {
    db,
    user,
    role,
    setRole,
    ready,
    reset,
    notify
  } = useApp();
  const [mobile, setMobile] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const sidebarExpanded = sidebarHovered || sidebarFocused;
  const [settings, setSettings] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const query = useMockQuery(path);
  const auth = ['/login', '/cadastro', '/recuperar-senha'].includes(path);
  if (auth) return <>
    {children}
  </>;
  const recentNotices = db.announcements.filter(a => role === 'admin' || db.classes.some(c => c.id === a.classId && (role === 'student' ? c.studentIds.includes(user.id) : db.subjects.some(s => s.classId === c.id && s.teacherId === user.id)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const isStaff = role !== 'student';
  const navigation = (compact = false, desktop = false) => <>
    <div className="mb-8 shrink-0 px-4">
      <Logo symbolOnly={compact} />

    </div>
    <nav id={desktop ? 'desktop-navigation' : undefined} aria-label="Navegação principal" className={cn('space-y-6', desktop ? 'app-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pl-3 pr-0.5' : 'px-3')}>
      {['Estudos', 'Comunidade', 'Gestão'].map((group, index) => {
        const items = nav.filter((item, i) => (index === 0 ? i < 4 : index === 1 ? i >= 4 && i < 7 : i >= 7) && (!item.staff || isStaff) && (!item.admin || role === 'admin'));
        if (!items.length) return null;
        return <div key={group}>
          <p aria-hidden={desktop && compact} className={cn('mb-2 h-4 whitespace-nowrap px-3 text-xs font-medium text-slate-500', desktop && 'app-sidebar-label')}>{group}</p>
          <div className="space-y-1">{items.map(item => {
        const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
        return <Link key={item.href} href={item.href} onClick={() => setMobile(false)} title={compact ? item.label : undefined} aria-label={item.label} aria-current={active ? 'page' : undefined} className={cn('min-h-11 items-center rounded-lg py-2.5 text-sm transition-colors', desktop ? 'grid grid-cols-[55px_minmax(0,1fr)]' : 'flex gap-3 px-[18px]', active ? 'bg-brand-100 font-semibold text-brand-700' : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
        <item.icon aria-hidden="true" className={cn('size-[18px] shrink-0', desktop && 'justify-self-center')} strokeWidth={1.8} />
        <span aria-hidden={desktop && compact} className={cn('min-w-0 overflow-hidden whitespace-nowrap', desktop && 'app-sidebar-label')}>{item.label}</span>
      </Link>;
      })}</div>
        </div>;
      })}
    </nav>
    <div className="mt-auto shrink-0 px-4 pt-8">
      <button aria-label={`Demonstração: ${roleLabels[role]}. Alterar perfil e opções`} title={compact ? `Demonstração · ${roleLabels[role]}` : undefined} onClick={() => { setMobile(false); setSettings(true); }} className={cn('min-h-11 w-full items-center rounded-lg text-xs text-slate-500 hover:bg-slate-100', desktop ? 'grid grid-cols-[48px_minmax(0,1fr)] gap-3 text-left' : 'flex gap-2')}><FlaskConical aria-hidden="true" className={cn('size-4 shrink-0', desktop && 'justify-self-center')} /><span aria-hidden={desktop && compact} className={cn('min-w-0 overflow-hidden whitespace-nowrap', desktop && 'app-sidebar-label')}>Demonstração · {roleLabels[role]}</span></button>
      <Link href="/perfil" aria-label={`${user.name} · Ver perfil`} title={compact ? `${user.name} · Ver perfil` : undefined} onClick={() => setMobile(false)} className={cn('items-center gap-3 border-t border-slate-100 py-5', desktop ? 'grid grid-cols-[48px_minmax(0,1fr)]' : 'flex')}>
        <span className={desktop ? 'flex justify-center' : undefined}><Avatar name={user.name} src={user.avatar} /></span>
        <div aria-hidden={desktop && compact} className={cn('min-w-0 overflow-hidden whitespace-nowrap', desktop && 'app-sidebar-label')}>
          <p className="truncate text-sm font-semibold">
            {user.name}
          </p>
          <p className="text-xs text-slate-500">{roleLabels[role]} · Ver perfil</p>
        </div>
      </Link>
    </div>
  </>;
  return <div className="min-h-dvh">
    <a href="#main" className="sr-only z-[100] rounded bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Pular para o conteúdo</a>
    <aside aria-label="Barra lateral" data-expanded={sidebarExpanded} onPointerEnter={event => {
      if (event.pointerType !== 'touch') setSidebarHovered(true);
    }} onPointerLeave={() => setSidebarHovered(false)} onPointerDown={() => setSidebarFocused(false)} onFocusCapture={event => {
      if (event.target.matches(':focus-visible')) setSidebarFocused(true);
    }} onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setSidebarFocused(false);
    }} onKeyDown={event => {
      if (event.key === 'Escape') {
        setSidebarHovered(false);
        setSidebarFocused(false);
        document.getElementById('main')?.focus({ preventScroll: true });
      }
    }} className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-slate-200/80 bg-white pt-8 transition-[width,box-shadow] duration-200 lg:flex', sidebarExpanded ? 'w-60 shadow-xl shadow-slate-900/10' : 'w-20')}>
      {navigation(!sidebarExpanded, true)}
    </aside>
    <Dialog open={mobile} onClose={() => setMobile(false)} title="Navegação">
      <div className="flex flex-col">
        {navigation()}
      </div>
    </Dialog>
    <div className="lg:pl-20">
      <Button variant="secondary" className="fixed left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-20 bg-white shadow-md lg:absolute lg:left-4 lg:top-4 lg:z-20 lg:hidden" aria-label="Abrir menu" aria-expanded={mobile} aria-haspopup="dialog" onClick={() => setMobile(true)}><Menu aria-hidden="true" className="size-5" /></Button>
      <button aria-label="Notificações" aria-haspopup="dialog" onClick={() => setNotifications(true)} className="fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-20 flex size-12 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-700 shadow-md hover:bg-brand-50 lg:fixed lg:bottom-5 lg:right-5 lg:top-auto"><Bell aria-hidden="true" className="size-5" /></button>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-7 pt-20 sm:px-8 lg:py-9 xl:px-10">
        {!ready || query.loading ? <Skeleton /> : query.error ? <ErrorState message={query.error} retry={query.retry} /> : children}
      </main>
      <footer className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 pb-24 pt-3 text-xs text-slate-500 sm:px-8 xl:px-10">
        <span>AJA Digital · Ambiente de demonstração</span>
        <Link href="/login" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-brand-600"><LogOut className="size-3.5" />Sair da demonstração</Link>
      </footer>
    </div>
    <Dialog open={notifications} onClose={() => setNotifications(false)} title="Notificações">
      <p className="mb-4 text-sm text-slate-500">Avisos recentes das suas turmas.</p>
      <div className="divide-y divide-slate-100">{recentNotices.map(a => <Link key={a.id} href="/avisos" onClick={() => setNotifications(false)} className="block rounded-lg py-4 text-sm hover:bg-brand-50"><span className="block font-semibold">{a.title}</span><span className="mt-1 block text-slate-500">{db.classes.find(c => c.id === a.classId)?.name}</span></Link>)}</div>
      {!recentNotices.length && <p className="py-4 text-sm text-slate-600">Nenhuma notificação.</p>}
      <Link href="/avisos" onClick={() => setNotifications(false)} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Ver todos os avisos</Link>
    </Dialog>
    <Dialog open={settings} onClose={() => {
      setSettings(false);
      setConfirmReset(false);
    }} title="Ambiente de demonstração">
      <p className="mb-5 text-sm leading-6 text-slate-500">Nenhum backend está conectado. Alterações são guardadas apenas neste navegador. Não use senhas, documentos ou dados pessoais reais.</p>
      <Select label="Visualizar como" value={role} onChange={event => {
        setRole(event.target.value as Role);
        router.push('/');
        setSettings(false);
      }}>
        <option value="student">Fernando · Aluno</option>
        <option value="teacher">Mariana · Professora</option>
        <option value="admin">Rafael · Administrador</option>
      </Select>
      <div className="mt-6 space-y-3">
        <Button variant="secondary" className="w-full" onClick={() => {
          simulateNextFailure();
          setSettings(false);
          notify('A próxima consulta ou operação terá uma falha simulada.');
        }}>Simular falha na próxima operação</Button>
        {confirmReset ? <div className="rounded-xl bg-rose-50 p-4">
          <p className="mb-3 text-sm">Apagar as alterações locais e restaurar os exemplos?</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => {
              reset();
              setConfirmReset(false);
              setSettings(false);
              router.push('/');
            }}>Restaurar</Button>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancelar</Button>
          </div>
        </div> : <Button variant="ghost" className="w-full" onClick={() => setConfirmReset(true)}>Restaurar dados de exemplo</Button>}
      </div>
    </Dialog>
  </div>;
}

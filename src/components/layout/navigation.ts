import { BookOpen, LayoutDashboard, GraduationCap, MessageSquare, CalendarDays, LibraryBig, ClipboardCheck, Users, Bell, Settings2, ListChecks, type LucideIcon } from 'lucide-react';

export const nav: {
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

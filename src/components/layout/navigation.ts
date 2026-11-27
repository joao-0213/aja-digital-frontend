import { BookOpen, LayoutDashboard, GraduationCap, MessageSquare, CalendarDays, LibraryBig, ClipboardCheck, Users, Bell, Settings2, ListChecks, type LucideIcon } from 'lucide-react';
import type { Role } from '@/models';

export interface NavItem {
  href: string;
  label: string;
  staffLabel?: string;
  adminLabel?: string;
  icon: LucideIcon;
  staff?: boolean;
  admin?: boolean;
}

export const nav: NavItem[] = [{
  href: '/',
  label: 'Meu painel',
  staffLabel: 'Painel',
  icon: LayoutDashboard
}, {
  href: '/disciplinas',
  label: 'Minhas disciplinas',
  staffLabel: 'Disciplinas',
  icon: BookOpen
}, {
  href: '/questionarios',
  label: 'Atividades',
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
  admin: true
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
  label: 'Usuários e docentes',
  icon: Settings2,
  admin: true
}];

export function navLabelForRole(item: NavItem, role: Role): string {
  if (role === 'admin' && item.adminLabel) return item.adminLabel;
  if (role !== 'student' && item.staffLabel) return item.staffLabel;
  return item.label;
}

export function navGroupsForRole(role: Role): readonly [string, string, string] {
  return [
    role === 'admin' ? 'Acadêmico' : role === 'teacher' ? 'Ensino' : 'Estudos',
    'Comunidade',
    'Gestão',
  ];
}

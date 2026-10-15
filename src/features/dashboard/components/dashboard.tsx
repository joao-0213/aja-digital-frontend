'use client';

import { useApp } from '@/providers/app-context';
import { StudentDashboard } from './student-dashboard';
import { StaffDashboard } from './staff-dashboard';

export function Dashboard() {
  const { role } = useApp();
  return role === 'student' ? <StudentDashboard /> : <StaffDashboard />;
}

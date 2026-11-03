'use client';

import { useSession } from '@/providers/app-context';
import { StudentDashboard } from './student-dashboard';
import { StaffDashboard } from './staff-dashboard';

export function Dashboard() {
  const { user } = useSession();
  return user?.role === 'student' ? <StudentDashboard /> : <StaffDashboard />;
}

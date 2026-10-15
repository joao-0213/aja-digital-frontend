import type { MockDatabase } from '@/models';

// Preserve the persisted demo contract across internal reorganizations.
export const DEMO_DATABASE_KEY = 'aja-digital-demo-v1';
export const DEMO_ROLE_KEY = 'aja-demo-role';

export function isDatabase(value: unknown): value is MockDatabase {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MockDatabase>;
  return item.version === 1 && ['users', 'classes', 'subjects', 'modules', 'materials', 'questions', 'assessments', 'attempts', 'topics', 'announcements', 'events', 'attendance', 'documents', 'progress'].every(key => Array.isArray(item[key as keyof MockDatabase]));
}

import type { RecordMeta } from './audit';

export type Role = 'student' | 'teacher' | 'admin';

export interface User extends RecordMeta {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  /** null requires the explicitly labelled local confirmation step. */
  emailConfirmedAt?: string | null;
}

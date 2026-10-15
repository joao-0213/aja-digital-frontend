export type Role = 'student' | 'teacher' | 'admin';

export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  course: string;
  institution: string;
  quota: 'none' | 'public_school' | 'income' | 'racial' | 'disability';
  bio: string;
  avatar?: string;
}

export interface StudentDocument {
  id: string;
  userId: string;
  name: string;
  size: number;
  status: DocumentStatus;
  uploadedAt: string;
  reason?: string;
}

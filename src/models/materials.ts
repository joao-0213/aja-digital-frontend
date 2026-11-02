import type { RecordMeta } from './audit';

export type MaterialKind = 'lesson' | 'pdf' | 'video';

export interface Material extends RecordMeta {
  id: string;
  moduleId: string;
  title: string;
  kind: MaterialKind;
  duration: number;
  content: string;
  fileName?: string;
  localFileId?: string;
  fileSize?: number;
  createdAt?: string;
  authorId?: string;
  order: number;
}

export interface Progress extends RecordMeta {
  userId: string;
  materialId: string;
  completed: boolean;
  lastAccess: string;
}

export interface RecordMeta {
  revision?: number;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: 'create' | 'update' | 'delete';
  collection: string;
  targetId: string;
  createdAt: string;
}

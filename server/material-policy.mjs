import { HttpError } from './command-service.mjs';
import { canAccessSubject, canManageSubject } from '../src/lib/access.ts';

export const missingMaterial = () => { throw new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.'); };
export const deniedMaterial = () => { throw new HttpError(403, 'FORBIDDEN', 'Seu acesso não permite esta operação.'); };
export function moduleContext(state, actor, id, write = false) {
  const module = state.modules.find(m => m.id === id && !m.deletedAt);
  if (!module) missingMaterial();
  const subject = state.subjects.find(s => s.id === module.subjectId && !s.deletedAt);
  if (!subject) missingMaterial();
  if (write ? !canManageSubject(state, actor, subject.id) : !canAccessSubject(state, actor, subject.id)) { if (write) deniedMaterial(); missingMaterial(); }
  return { module, subject };
}
export function materialContext(state, actor, id, write = false) {
  const material = state.materials.find(m => m.id === id && !m.deletedAt);
  if (!material) missingMaterial();
  return { material, ...moduleContext(state, actor, material.moduleId, write) };
}

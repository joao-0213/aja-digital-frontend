'use client';

import { useEffect, useRef } from 'react';
import type { MockDatabase, User } from '@/models';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
type ModelDocument = Document & {
  modelContext?: {
    registerTool: (tool: Tool, options?: {
      signal: AbortSignal;
    }) => void | Promise<void>;
  };
};
/** Optional progressive enhancement; unsupported browsers need no polyfill. */
export function useStudyTools(db: MockDatabase, user: User, mutate: (recipe: (draft: MockDatabase) => void, message?: string) => Promise<boolean>) {
  const latest = useRef({
    db,
    user,
    mutate
  });
  latest.current = {
    db,
    user,
    mutate
  };
  useEffect(() => {
    const registry = (document as ModelDocument).modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [{
      name: 'read_study_materials',
      description: 'Lista materiais e progresso da demonstração local AJA Digital.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true
      },
      execute() {
        const {
          db,
          user
        } = latest.current;
        return db.materials.map(m => ({
          id: m.id,
          title: m.title,
          completed: db.progress.some(p => p.userId === user.id && p.materialId === m.id && p.completed)
        }));
      }
    }, {
      name: 'complete_study_material',
      description: 'Marca um material existente como concluído nos dados locais, como o botão Marcar como concluído.',
      inputSchema: {
        type: 'object',
        properties: {
          materialId: {
            type: 'string'
          }
        },
        required: ['materialId'],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      async execute(input) {
        if (!input || typeof input !== 'object' || !('materialId' in input) || typeof input.materialId !== 'string' || Object.keys(input).some(k => k !== 'materialId')) throw new Error('Informe somente materialId.');
        const {
          db,
          user,
          mutate
        } = latest.current;
        const materialId = input.materialId;
        const material = db.materials.find(m => m.id === materialId);
        if (!material) throw new Error('Material não encontrado.');
        const subject = db.subjects.find(s => s.id === db.modules.find(m => m.id === material.moduleId)?.subjectId);
        if (user.role === 'student' && !db.classes.some(c => c.id === subject?.classId && c.studentIds.includes(user.id))) throw new Error('Aluno não matriculado nesta turma.');
        const ok = await mutate(d => {
          const p = d.progress.find(p => p.materialId === materialId && p.userId === user.id);
          if (p) p.completed = true;else d.progress.push({
            materialId,
            userId: user.id,
            completed: true,
            lastAccess: new Date().toISOString()
          });
        }, 'Material concluído.');
        if (!ok) throw new Error('Falha simulada ao salvar.');
        return {
          materialId,
          completed: true
        };
      }
    }];
    for (const tool of tools) {
      try {
        void Promise.resolve(registry.registerTool(tool, {
          signal: lifecycle.signal
        })).catch(() => {});
      } catch {/* Optional browser capability must not block the UI. */}
    }
    return () => lifecycle.abort();
  }, []);
}

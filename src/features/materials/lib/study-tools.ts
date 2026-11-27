import { HttpError } from '../../../lib/http-client.ts';

export interface StudyTool {
  name: string; description: string; inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input?: unknown): Promise<unknown>;
}
interface Transport {
  list(filters: object, page: number, signal?: AbortSignal): Promise<{ items: { id: string; title: string }[]; total: number }>;
  progressPage(page: number, signal?: AbortSignal): Promise<{ items: { materialId: string; completed: boolean }[]; total: number }>;
  progress(id: string, completed: true, signal?: AbortSignal): Promise<{ materialId: string; completed: boolean }>;
}

/** Each registration keeps its original session fence, never a latest-user ref. */
export function createStudyTools(api: Transport, scope: { isCurrent(): boolean; signal?: AbortSignal }, completed: () => Promise<void> = async () => {}): StudyTool[] {
  const guard = () => {
    if (scope.signal?.aborted || !scope.isCurrent()) throw new HttpError('cancelled', 'A sessão desta ferramenta mudou ou a consulta foi cancelada.');
  };
  return [{
    name: 'read_study_materials', description: 'Lista os materiais e o progresso permitidos para a sua conta.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute(input = {}) {
      guard();
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Esta consulta não recebe campos adicionais.');
      const materials: { id: string; title: string }[] = [];
      const progress = new Map<string, boolean>();
      for (let page = 1; ; page++) {
        guard(); const result = await api.list({}, page, scope.signal); guard();
        materials.push(...result.items);
        if (materials.length >= result.total || !result.items.length) break;
      }
      let count = 0;
      for (let page = 1; ; page++) {
        guard(); const result = await api.progressPage(page, scope.signal); guard();
        count += result.items.length;
        for (const item of result.items) progress.set(item.materialId, item.completed);
        if (count >= result.total || !result.items.length) break;
      }
      guard();
      return materials.map(material => ({ id: material.id, title: material.title, completed: progress.get(material.id) ?? false }));
    }
  }, {
    name: 'complete_study_material', description: 'Marca um material permitido como concluído, usando a mesma operação do botão da página.',
    inputSchema: { type: 'object', properties: { materialId: { type: 'string' } }, required: ['materialId'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      guard();
      if (!input || typeof input !== 'object' || Array.isArray(input) || !('materialId' in input) || typeof input.materialId !== 'string' || !input.materialId.trim() || Object.keys(input).some(key => key !== 'materialId')) throw new Error('Informe somente materialId.');
      guard(); const result = await api.progress(input.materialId, true, scope.signal); guard();
      await completed(); guard();
      return { materialId: result.materialId, completed: result.completed };
    }
  }];
}

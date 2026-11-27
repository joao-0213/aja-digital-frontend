export type WorkUploadBatchAttachment =
  | { kind: 'file'; fileId: string; name: string }
  | { kind: 'link'; name: string; url: string };

export type WorkUploadIntent = { key: string; name: string; size: number; type: string; digest: string };

export interface WorkUploadBatchState<TFile> {
  items: WorkUploadBatchAttachment[];
  files: Record<string, TFile>;
  uploads: Record<string, WorkUploadIntent>;
}

export async function resolveWorkUploadBatch<TFile>(
  snapshot: WorkUploadBatchAttachment[],
  files: Record<string, TFile>,
  uploads: Record<string, WorkUploadIntent>,
  upload: (localId: string, intent: WorkUploadIntent, file: TFile) => Promise<{ id: string; name: string }>,
  onProgress: (state: WorkUploadBatchState<TFile>, localId: string) => void = () => {},
): Promise<WorkUploadBatchState<TFile>> {
  let current: WorkUploadBatchState<TFile> = { items: [...snapshot], files: { ...files }, uploads: { ...uploads } };
  for (const [localId, intent] of Object.entries(current.uploads)) {
    if (!current.items.some(item => item.kind === 'file' && item.fileId === localId)) continue;
    const file = current.files[localId];
    if (!file) throw new Error(`Selecione novamente “${intent.name}” para repetir o mesmo envio de arquivo.`);
    const staged = await upload(localId, intent, file);
    const next: WorkUploadBatchState<TFile> = {
      items: current.items.map(item => item.kind === 'file' && item.fileId === localId ? { kind: 'file', fileId: staged.id, name: staged.name } : item),
      files: { ...current.files },
      uploads: { ...current.uploads },
    };
    delete next.files[localId];
    delete next.uploads[localId];
    current = next;
    onProgress(current, localId);
  }
  return current;
}

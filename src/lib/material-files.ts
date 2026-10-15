const DATABASE = 'aja-material-files';
const STORE = 'files';

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento de arquivos.'));
    request.onblocked = () => reject(new Error('Feche outras abas da demonstração e tente novamente.'));
  });
}

export async function saveMaterialFiles(files: { id: string; file: File }[]) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      files.forEach(({ id, file }) => store.put(file, id));
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error('Não foi possível salvar os arquivos. Verifique o espaço disponível no navegador.'));
    });
  } finally { db.close(); }
}

export async function readMaterialFile(id: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Não foi possível abrir o arquivo.'));
    });
  } finally { db.close(); }
}

export async function removeMaterialFiles(ids?: string[]) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      if (ids) ids.forEach(id => store.delete(id)); else store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error('Não foi possível remover os arquivos locais.'));
    });
  } finally { db.close(); }
}

// IndexedDB: проекты и пользовательские шаблоны мебели. Экспорт/импорт файла проекта.
import type { CabinetDesign } from '../cabinet/types';
import { migrateProject } from '../model/migrate';
import type { Project } from '../model/types';

const DB_NAME = 'housebuilder';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export interface ProjectInfo {
  id: string;
  name: string;
  kind: Project['kind'];
  updatedAt: number;
}

export const saveProject = (p: Project): Promise<unknown> => tx('projects', 'readwrite', (s) => s.put(p));
export const loadProject = async (id: string): Promise<Project | null> => {
  const raw = await tx<Project | undefined>('projects', 'readonly', (s) => s.get(id));
  return raw ? migrateProject(raw) : null;
};
export const deleteProject = (id: string): Promise<unknown> => tx('projects', 'readwrite', (s) => s.delete(id));
export const listProjects = async (): Promise<ProjectInfo[]> => {
  const all = await tx<Project[]>('projects', 'readonly', (s) => s.getAll());
  return all.map((p) => ({ id: p.id, name: p.name, kind: p.kind, updatedAt: p.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const saveTemplate = (d: CabinetDesign): Promise<unknown> => tx('templates', 'readwrite', (s) => s.put(d));
export const deleteTemplate = (id: string): Promise<unknown> => tx('templates', 'readwrite', (s) => s.delete(id));
export const listTemplates = (): Promise<CabinetDesign[]> => tx<CabinetDesign[]>('templates', 'readonly', (s) => s.getAll());

export function projectToFile(p: Project): string {
  return JSON.stringify({ format: 'housebuilder-project', ...p }, null, 1);
}

export function projectFromFile(text: string): Project {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !Array.isArray(data.levels)) throw new Error('Невідомий формат файлу проєкту');
  delete data.format;
  return migrateProject(data as Project);
}

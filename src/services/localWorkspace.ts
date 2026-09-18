import { CardDefinition } from '../types/card';
import { PvEChallenge, BattleLog } from '../types/battle';
import { CampaignDefinition } from '../types/campaign';

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

const DB_NAME = 'splinterlands-local-workspace';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'local-folder';

export class LocalWorkspaceService {
  private static cachedHandle: FileSystemDirectoryHandle | null = null;
  private static lastError: string | null = null;

  static getLastError(): string | null {
    return this.lastError;
  }

  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
  }

  static async loadLocalCreations(): Promise<{
    cards: CardDefinition[];
    challenges: PvEChallenge[];
    campaigns: CampaignDefinition[];
    battleLogs: BattleLog[];
  }> {
    try {
      const response = await fetch('/__local_workspace_load');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch {
      return { cards: [], challenges: [], campaigns: [], battleLogs: [] };
    }
  }

  static async initialize(): Promise<boolean> {
    this.cachedHandle = await this.getHandle();
    return Boolean(this.cachedHandle);
  }

  static async chooseFolder(): Promise<boolean> {
    if (!this.isSupported()) return false;
    this.lastError = null;
    try {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) return false;
      const handle = await picker({ mode: 'readwrite' });
      this.cachedHandle = handle;
      await this.saveHandle(handle);
      return true;
    } catch (error: any) {
      this.lastError = error?.message || error?.name || 'Folder selection was cancelled.';
      if (error?.name !== 'AbortError') {
        console.error('Could not select local workspace folder', error);
      }
      return false;
    }
  }

  static async writeCreation(kind: 'cards' | 'battles' | 'campaigns', value: CardDefinition | PvEChallenge | CampaignDefinition | BattleLog): Promise<boolean> {
    // The launched Vite app writes directly to the project local folder. This requires no browser permission.
    if (await this.writeThroughDevServer(kind, value)) return true;
    if (!this.isSupported()) return false;

    // Call the picker before any await so the browser still considers this a Save-button gesture.
    let handle = this.cachedHandle;
    if (!handle) {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) return this.writeThroughDevServer(kind, value);
      try {
        handle = await picker({ mode: 'readwrite' });
        this.cachedHandle = handle;
        await this.saveHandle(handle);
      } catch (error: any) {
        this.lastError = error?.message || error?.name || 'Folder selection was cancelled.';
        if (error?.name !== 'AbortError') {
          console.error('Could not select local workspace folder', error);
        }
        return this.writeThroughDevServer(kind, value);
      }
    }

    if (!handle) return false;

    try {
      const permission = await this.ensurePermission(handle);
      if (permission !== 'granted') return this.writeThroughDevServer(kind, value);

      const folder = await handle.getDirectoryHandle(kind, { create: true });
      const item = value as any;
      const fileName = `${kind.slice(0, -1)}_${item.id || Date.now()}.json`;
      const fileHandle = await folder.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(value, null, 2));
      await writable.close();
      return true;
    } catch (error) {
      console.error('Could not write creation to local workspace', error);
      return this.writeThroughDevServer(kind, value);
    }
  }

  static async deleteCreation(kind: 'cards' | 'battles' | 'campaigns', id: string): Promise<boolean> {
    try {
      const response = await fetch('/__local_workspace_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      });
      if (response.ok) return true;
    } catch {
      // Fall through to the browser-selected folder.
    }

    if (!this.cachedHandle) return false;
    try {
      const permission = await this.ensurePermission(this.cachedHandle);
      if (permission !== 'granted') return false;
      const folder = await this.cachedHandle.getDirectoryHandle(kind, { create: true });
      const fileName = `${kind.slice(0, -1)}_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      await folder.removeEntry(fileName);
      return true;
    } catch (error: any) {
      if (error?.name !== 'NotFoundError') console.error('Could not delete local workspace file', error);
      return error?.name === 'NotFoundError';
    }
  }

  private static async writeThroughDevServer(
    kind: 'cards' | 'battles' | 'campaigns',
    value: CardDefinition | PvEChallenge | CampaignDefinition | BattleLog
  ): Promise<boolean> {
    try {
      const response = await fetch('/__local_workspace_save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private static async ensurePermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    const permissionHandle = handle as FileSystemDirectoryHandle & {
      queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
      requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
    };
    const current = permissionHandle.queryPermission
      ? await permissionHandle.queryPermission({ mode: 'readwrite' })
      : 'granted';
    if (current === 'granted') return current;
    return permissionHandle.requestPermission
      ? permissionHandle.requestPermission({ mode: 'readwrite' })
      : current;
  }

  private static async getHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!('indexedDB' in window)) return null;
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => {
        const transaction = request.result.transaction(STORE_NAME, 'readonly');
        const get = transaction.objectStore(STORE_NAME).get(HANDLE_KEY);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    });
  }

  private static async saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => {
        const transaction = request.result.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      };
      request.onerror = () => resolve();
    });
  }
}

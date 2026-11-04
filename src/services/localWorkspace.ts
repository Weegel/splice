import { CardDefinition } from '../types/card';
import { PvEChallenge, BattleLog } from '../types/battle';
import { CampaignDefinition, CampaignRunState } from '../types/campaign';
import { LocalPlayerProfile } from '../types/profile';

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

const DB_NAME = 'splinterlands-local-workspace';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'local-folder';

export class LocalWorkspaceService {
  private static cachedHandle: FileSystemDirectoryHandle | null = null;
  private static lastError: string | null = null;
  private static campaignRunWrite: Promise<boolean> = Promise.resolve(true);

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
    profiles: LocalPlayerProfile[] | null;
    activeProfileId: string | null;
    campaignRuns: Record<string, CampaignRunState> | null;
  }> {
    try {
      const response = await fetch('/__local_workspace_load');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch {
      return { cards: [], challenges: [], campaigns: [], battleLogs: [], profiles: null, activeProfileId: null, campaignRuns: null };
    }
  }

  static writeCampaignRuns(runs: Record<string, CampaignRunState>): Promise<boolean> {
    const body = JSON.stringify({ runs });
    this.campaignRunWrite = this.campaignRunWrite.then(async () => {
      try {
        const response = await fetch('/__local_campaign_runs_save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return true;
      } catch (error) {
        console.error('Could not save campaign progress to disk', error);
        return false;
      }
    });
    return this.campaignRunWrite;
  }

  static async writeProfiles(profiles: LocalPlayerProfile[], activeProfileId: string | null): Promise<boolean> {
    try {
      const response = await fetch('/__local_profiles_save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles, activeProfileId }),
      });
      return response.ok;
    } catch {
      return false;
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
      const existingFileName = await this.findFileNameById(folder, item.id);
      const baseName = kind === 'battles'
        ? `battle_${this.normalizeFilePart(item.name || `${item.summoner1?.name || 'team_1'} vs ${item.summoner2?.name || 'team_2'}`)}`
        : `${kind.slice(0, -1)}_${this.normalizeFilePart(item.id || Date.now())}`;
      const fileName = existingFileName || await this.findAvailableFileName(folder, baseName);
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
      const fileName = await this.findFileNameById(folder, id);
      if (fileName) await folder.removeEntry(fileName);
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

  private static normalizeFilePart(value: unknown): string {
    return String(value || 'unnamed')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unnamed';
  }

  private static async findFileNameById(folder: FileSystemDirectoryHandle, id: string): Promise<string | null> {
    const iterableFolder = folder as FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    for await (const [name, handle] of iterableFolder.entries()) {
      if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
      try {
        const value = JSON.parse(await (handle as FileSystemFileHandle).getFile().then((file) => file.text()));
        if (value?.id === id) return name;
      } catch {
        // Invalid files are ignored while locating an existing creation.
      }
    }
    return null;
  }

  private static async findAvailableFileName(folder: FileSystemDirectoryHandle, baseName: string): Promise<string> {
    for (let suffix = 0; ; suffix++) {
      const fileName = `${baseName}${suffix ? `(${suffix})` : ''}.json`;
      try {
        await folder.getFileHandle(fileName);
      } catch (error: any) {
        if (error?.name === 'NotFoundError') return fileName;
        throw error;
      }
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

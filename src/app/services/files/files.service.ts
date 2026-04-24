import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';

export interface StorageEntry {
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FilesService {
  private readonly bucket = 'files';
  private readonly cyrillicMap: Record<string, string> = {
    А: 'A', а: 'a', Б: 'B', б: 'b', В: 'V', в: 'v', Г: 'G', г: 'g', Д: 'D', д: 'd',
    Е: 'E', е: 'e', Ё: 'Yo', ё: 'yo', Ж: 'Zh', ж: 'zh', З: 'Z', з: 'z', И: 'I', и: 'i',
    Й: 'Y', й: 'y', К: 'K', к: 'k', Л: 'L', л: 'l', М: 'M', м: 'm', Н: 'N', н: 'n',
    О: 'O', о: 'o', П: 'P', п: 'p', Р: 'R', р: 'r', С: 'S', с: 's', Т: 'T', т: 't',
    У: 'U', у: 'u', Ф: 'F', ф: 'f', Х: 'Kh', х: 'kh', Ц: 'Ts', ц: 'ts', Ч: 'Ch', ч: 'ch',
    Ш: 'Sh', ш: 'sh', Щ: 'Sch', щ: 'sch', Ъ: '', ъ: '', Ы: 'Y', ы: 'y', Ь: '', ь: '',
    Э: 'E', э: 'e', Ю: 'Yu', ю: 'yu', Я: 'Ya', я: 'ya',
    І: 'I', і: 'i', Ї: 'Yi', ї: 'yi', Є: 'Ye', є: 'ye', Ґ: 'G', ґ: 'g',
  };

  private normalizeRelativePath(path: string): string {
    return (path || '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .trim();
  }

  private transliterateCyrillic(value: string): string {
    return Array.from(value || '')
      .map((char) => this.cyrillicMap[char] ?? char)
      .join('');
  }

  private replaceGermanChars(value: string): string {
    return value
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss');
  }

  private avoidWindowsReservedName(value: string): string {
    if (!value) {
      return value;
    }

    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(value)) {
      return `${value}-file`;
    }

    return value;
  }

  private sanitizeExtension(ext: string): string {
    return this.replaceGermanChars(this.transliterateCyrillic(ext || ''))
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase();
  }

  private sanitizeSegment(name: string): string {
    const sanitized = this.replaceGermanChars(this.transliterateCyrillic(name || ''))
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/&/g, ' und ')
      .replace(/@/g, ' at ')
      .replace(/[’‘`´]/g, '\'')
      .replace(/[_\s]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*/g, '-')
      .replace(/\.{2,}/g, '.')
      .replace(/[^a-zA-Z0-9 ._'()-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/ {2,}/g, ' ')
      .replace(/^[.\s-]+|[.\s-]+$/g, '')
      .trim();

    return this.avoidWindowsReservedName(sanitized);
  }

  private sanitizeFileName(name: string): string {
    const normalizedName = (name || '').replace(/[\\/]+/g, ' ').trim();
    const lastDotIndex = normalizedName.lastIndexOf('.');
    const hasExtension = lastDotIndex > 0;

    const rawBase = hasExtension ? normalizedName.slice(0, lastDotIndex) : normalizedName;
    const rawExt = hasExtension ? normalizedName.slice(lastDotIndex + 1) : '';

    const ext = this.sanitizeExtension(rawExt);
    const base = this.sanitizeSegment(rawBase);

    if (!base) {
      return ext ? `file.${ext}` : 'file';
    }

    return ext ? `${base}.${ext}` : base;
  }

  getUploadFileName(originalName: string): string {
    return this.sanitizeFileName(originalName);
  }

  private tenantPrefix(tenantId: number, relativePath: string = ''): string {
    const normalized = this.normalizeRelativePath(relativePath);
    return normalized ? `${tenantId}/${normalized}` : `${tenantId}`;
  }

  private toRelativePath(baseRelativePath: string, name: string): string {
    const normalizedBase = this.normalizeRelativePath(baseRelativePath);
    return normalizedBase ? `${normalizedBase}/${name}` : name;
  }

  private isFolderItem(item: any): boolean {
    return !item?.metadata;
  }

  private async listRaw(prefix: string): Promise<any[]> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .list(prefix, { sortBy: { column: 'name', order: 'asc' }, limit: 1000 });

    if (error) {
      throw error;
    }

    return data || [];
  }

  private async collectFileKeysRecursive(prefix: string): Promise<string[]> {
    const items = await this.listRaw(prefix);
    const fileKeys: string[] = [];

    for (const item of items) {
      if (item?.name === '.keep') {
        fileKeys.push(`${prefix}/.keep`);
        continue;
      }

      if (this.isFolderItem(item)) {
        const nestedPrefix = `${prefix}/${item.name}`;
        const nestedKeys = await this.collectFileKeysRecursive(nestedPrefix);
        fileKeys.push(...nestedKeys);
      } else {
        fileKeys.push(`${prefix}/${item.name}`);
      }
    }

    return fileKeys;
  }

  private async removeKeys(keys: string[]): Promise<void> {
    if (!keys.length) {
      return;
    }

    for (let index = 0; index < keys.length; index += 100) {
      const chunk = keys.slice(index, index + 100);
      const { error } = await supabase.storage.from(this.bucket).remove(chunk);

      if (error) {
        throw error;
      }
    }
  }

  private getNameFromPath(path: string): string {
    const normalized = this.normalizeRelativePath(path);
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  private getParentPath(path: string): string {
    const normalized = this.normalizeRelativePath(path);
    const parts = normalized.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  }

  private async moveFolder(tenantId: number, sourceRelativePath: string, targetRelativePath: string): Promise<void> {
    const sourcePrefix = this.tenantPrefix(tenantId, sourceRelativePath);
    const targetPrefix = this.tenantPrefix(tenantId, targetRelativePath);

    const keys = await this.collectFileKeysRecursive(sourcePrefix);

    for (const oldKey of keys) {
      const suffix = oldKey.replace(`${sourcePrefix}/`, '');
      const newKey = `${targetPrefix}/${suffix}`;
      const { error } = await supabase.storage.from(this.bucket).move(oldKey, newKey);

      if (error) {
        throw error;
      }
    }
  }

  async listEntries(tenantId: number, relativePath: string = ''): Promise<StorageEntry[]> {
    const prefix = this.tenantPrefix(tenantId, relativePath);
    const items = await this.listRaw(prefix);

    const entries = items
      .filter((item) => item.name !== '.keep')
      .map((item): StorageEntry => {
        const isFolder = this.isFolderItem(item);
        const path = this.toRelativePath(relativePath, item.name);

        return {
          name: item.name,
          path,
          isFolder,
          size: item?.metadata?.size,
          updatedAt: item?.updated_at || item?.created_at,
        };
      });

    return entries.sort((a, b) => {
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }

  async createFolder(tenantId: number, currentRelativePath: string, folderName: string): Promise<void> {
    const sanitizedFolder = this.sanitizeSegment(folderName);

    if (!sanitizedFolder) {
      throw new Error('Ungültiger Ordnername.');
    }

    const folderRelativePath = this.toRelativePath(currentRelativePath, sanitizedFolder);
    const key = `${this.tenantPrefix(tenantId, folderRelativePath)}/.keep`;

    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(key, new Blob(['']), { upsert: false, contentType: 'text/plain' });

    if (error) {
      throw error;
    }
  }

  async uploadFile(tenantId: number, currentRelativePath: string, file: File, overwrite: boolean = false): Promise<void> {
    const fileName = this.sanitizeFileName(file.name);

    if (!fileName) {
      throw new Error('Ungültiger Dateiname.');
    }

    const key = `${this.tenantPrefix(tenantId, currentRelativePath)}/${fileName}`;
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(key, file, { upsert: overwrite, contentType: file.type || undefined });

    if (error) {
      throw error;
    }
  }

  async downloadFile(tenantId: number, relativePath: string): Promise<{ blob: Blob; fileName: string }> {
    const key = this.tenantPrefix(tenantId, relativePath);
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .download(key);

    if (error) {
      throw error;
    }

    return {
      blob: data,
      fileName: this.getNameFromPath(relativePath),
    };
  }

  async getSignedFileUrl(tenantId: number, relativePath: string, expiresInSeconds: number = 600): Promise<string> {
    const key = this.tenantPrefix(tenantId, relativePath);
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw error || new Error('Signed URL konnte nicht erzeugt werden.');
    }

    return data.signedUrl;
  }

  async deleteEntry(tenantId: number, relativePath: string, isFolder: boolean): Promise<void> {
    if (isFolder) {
      const prefix = this.tenantPrefix(tenantId, relativePath);
      const keys = await this.collectFileKeysRecursive(prefix);
      await this.removeKeys(keys);
      return;
    }

    const key = this.tenantPrefix(tenantId, relativePath);
    await this.removeKeys([key]);
  }

  async renameEntry(tenantId: number, relativePath: string, newName: string, isFolder: boolean): Promise<void> {
    const parent = this.getParentPath(relativePath);
    const sanitizedName = isFolder ? this.sanitizeSegment(newName) : this.sanitizeFileName(newName);

    if (!sanitizedName) {
      throw new Error('Ungültiger Name.');
    }

    const targetRelativePath = this.toRelativePath(parent, sanitizedName);

    if (this.normalizeRelativePath(targetRelativePath) === this.normalizeRelativePath(relativePath)) {
      return;
    }

    if (isFolder) {
      await this.moveFolder(tenantId, relativePath, targetRelativePath);
      return;
    }

    const oldKey = this.tenantPrefix(tenantId, relativePath);
    const newKey = this.tenantPrefix(tenantId, targetRelativePath);
    const { error } = await supabase.storage.from(this.bucket).move(oldKey, newKey);

    if (error) {
      throw error;
    }
  }

  async moveEntry(tenantId: number, relativePath: string, targetFolder: string, isFolder: boolean): Promise<void> {
    const normalizedTarget = this.normalizeRelativePath(targetFolder);
    const sourceName = this.getNameFromPath(relativePath);
    const targetRelativePath = normalizedTarget ? `${normalizedTarget}/${sourceName}` : sourceName;

    if (this.normalizeRelativePath(relativePath) === this.normalizeRelativePath(targetRelativePath)) {
      return;
    }

    if (isFolder) {
      const sourceNormalized = this.normalizeRelativePath(relativePath);
      if (normalizedTarget.startsWith(sourceNormalized)) {
        throw new Error('Ordner kann nicht in sich selbst verschoben werden.');
      }

      await this.moveFolder(tenantId, relativePath, targetRelativePath);
      return;
    }

    const oldKey = this.tenantPrefix(tenantId, relativePath);
    const newKey = this.tenantPrefix(tenantId, targetRelativePath);
    const { error } = await supabase.storage.from(this.bucket).move(oldKey, newKey);

    if (error) {
      throw error;
    }
  }
}

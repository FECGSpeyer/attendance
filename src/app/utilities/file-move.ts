/**
 * Reine Hilfsfunktionen zum Verschieben in der Dateiablage
 * (Zielordner prüfen, Ordnerbaum). Pfade sind relativ zum Tenant-Root.
 */

export interface MoveItem {
  path: string;
  isFolder: boolean;
}

export function normalizeFilePath(path: string): string {
  return (path || '').split('/').filter(Boolean).join('/');
}

export function parentFilePath(path: string): string {
  return normalizeFilePath(path).split('/').filter(Boolean).slice(0, -1).join('/');
}

/** true, wenn `path` gleich `folder` ist oder darin liegt. */
export function isSameOrInside(path: string, folder: string): boolean {
  const p = normalizeFilePath(path);
  const f = normalizeFilePath(folder);
  if (!f) {
    return true;
  }
  return p === f || p.startsWith(`${f}/`);
}

/** Ordner, in die nicht verschoben werden darf: die verschobenen Ordner selbst und alles darunter. */
export function isBlockedTarget(target: string, items: MoveItem[]): boolean {
  return items.some((item) => item.isFolder && isSameOrInside(target, item.path));
}

/** true, wenn alle Einträge schon direkt im Zielordner liegen (Verschieben wäre wirkungslos). */
export function isCurrentLocation(target: string, items: MoveItem[]): boolean {
  const t = normalizeFilePath(target);
  return items.length > 0 && items.every((item) => parentFilePath(item.path) === t);
}

export function canMoveInto(target: string, items: MoveItem[]): boolean {
  return items.length > 0 && !isBlockedTarget(target, items) && !isCurrentLocation(target, items);
}

/** Ordnerpfade von der Wurzel bis `path`, z. B. 'a/b' → ['', 'a', 'a/b']. */
export function ancestorFilePaths(path: string): string[] {
  const segments = normalizeFilePath(path).split('/').filter(Boolean);
  return ['', ...segments.map((_, index) => segments.slice(0, index + 1).join('/'))];
}

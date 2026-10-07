import { isAbsolute, relative, resolve } from 'path';

/** Resolve a note-folder cwd and fall back to the vault root if it escapes the vault. */
export const resolveLaunchPath = (
  vaultPath: string,
  openAtCurrentNoteFolder: boolean,
  noteFolderPath?: string | null
): string => {
  const vaultRoot = resolve(vaultPath);
  if (!openAtCurrentNoteFolder || !noteFolderPath) {
    return vaultRoot;
  }
  const candidate = resolve(vaultRoot, noteFolderPath);
  const rel = relative(vaultRoot, candidate);
  if (!rel || rel === '') {
    return vaultRoot;
  }
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return vaultRoot;
  }
  return candidate;
};

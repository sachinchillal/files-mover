import AdmZip from 'adm-zip';
import type { IZipEntry } from 'adm-zip';
import fs from 'fs';
import path from 'path';
import type { ExtractZipResult } from '../types';
import { isDeniedFile } from '../path/denied';
import { hasParentTraversal, normalizeSegments, resolveWithinRoot } from '../path/paths';

const INVALID_FOLDER_NAME_CHARS = /[<>:"|?*\\/]/;

const emptyResult = (): ExtractZipResult => ({
  message: '',
  file: '',
  extractedTo: '',
  extractedFiles: 0,
  extractedDirectories: 0,
});

const isZipFile = (name: string): boolean => path.extname(name).toLowerCase() === '.zip';

const isPathWithinDir = (targetPath: string, dirPath: string): boolean => {
  const relative = path.relative(dirPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const validateFolderName = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return 'Invalid folder name';
  }
  if (INVALID_FOLDER_NAME_CHARS.test(trimmed)) {
    return 'Invalid folder name';
  }
  return null;
};

type ZipRootAnalysis = {
  rootFolders: Set<string>;
  hasLooseFiles: boolean;
};

const analyzeZipRoots = (entries: IZipEntry[]): ZipRootAnalysis => {
  const rootFolders = new Set<string>();
  let hasLooseFiles = false;

  for (const entry of entries) {
    const entryName = entry.entryName.replace(/\\/g, '/');
    if (!entryName) {
      continue;
    }

    const segments = normalizeSegments(entryName);
    if (segments.length === 0) {
      continue;
    }

    if (segments.length === 1 && !entryName.endsWith('/')) {
      hasLooseFiles = true;
      continue;
    }

    rootFolders.add(segments[0]!);
  }

  return { rootFolders, hasLooseFiles };
};

const resolveRenameMode = (
  analysis: ZipRootAnalysis
): { mode: 'replace' | 'wrap'; rootFolder: string | null } => {
  if (analysis.rootFolders.size === 1 && !analysis.hasLooseFiles) {
    return { mode: 'replace', rootFolder: [...analysis.rootFolders][0]! };
  }
  return { mode: 'wrap', rootFolder: null };
};

const mapEntryPath = (
  entryName: string,
  renameFolder: string,
  mode: 'replace' | 'wrap',
  rootFolder: string | null
): string => {
  const normalized = entryName.replace(/\\/g, '/');
  const isDirectory = normalized.endsWith('/');
  const segments = normalizeSegments(normalized);

  if (segments.length === 0) {
    return isDirectory ? `${renameFolder}/` : renameFolder;
  }

  if (mode === 'replace' && rootFolder) {
    const mapped = [renameFolder, ...segments.slice(1)].join('/');
    return isDirectory ? `${mapped}/` : mapped;
  }

  const mapped = [renameFolder, ...segments].join('/');
  return isDirectory ? `${mapped}/` : mapped;
};

export const extractZip = (
  sourceRoot: string,
  relativeFile: string,
  renameFolder?: string
): ExtractZipResult => {
  const trimmed = relativeFile.trim();
  if (!trimmed) {
    return { ...emptyResult(), message: 'No zip file selected' };
  }

  const segments = normalizeSegments(trimmed);
  if (hasParentTraversal(segments)) {
    return { ...emptyResult(), message: 'Incorrect path' };
  }

  const fileName = segments[segments.length - 1] ?? '';
  if (!isZipFile(fileName)) {
    return { ...emptyResult(), file: trimmed, message: 'Not a zip file' };
  }

  if (isDeniedFile(fileName)) {
    return { ...emptyResult(), file: trimmed, message: 'Access denied to for such file type' };
  }

  const resolved = resolveWithinRoot(sourceRoot, segments);
  if (!resolved) {
    return { ...emptyResult(), file: trimmed, message: 'Incorrect path' };
  }

  if (!fs.existsSync(resolved)) {
    return { ...emptyResult(), file: trimmed, message: 'Source not found' };
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return { ...emptyResult(), file: trimmed, message: 'Source not found' };
  }

  const extractDir = path.dirname(resolved);
  const extractedTo = segments.length > 1 ? segments.slice(0, -1).join('/') : '';

  let zip: AdmZip;
  try {
    zip = new AdmZip(resolved);
  } catch {
    return { ...emptyResult(), file: trimmed, message: 'Not a zip file' };
  }

  const entries = zip.getEntries();
  let renameMode: 'replace' | 'wrap' | null = null;
  let renamedFolder: string | null = null;
  let rootFolder: string | null = null;

  if (renameFolder !== undefined && renameFolder.trim() !== '') {
    const folderError = validateFolderName(renameFolder);
    if (folderError) {
      return { ...emptyResult(), file: trimmed, message: folderError };
    }

    renamedFolder = renameFolder.trim();
    const analysis = analyzeZipRoots(entries);
    const rename = resolveRenameMode(analysis);
    renameMode = rename.mode;
    rootFolder = rename.rootFolder;

    const targetDir = path.join(extractDir, renamedFolder);
    if (fs.existsSync(targetDir)) {
      return { ...emptyResult(), file: trimmed, message: 'Folder already exists' };
    }
  }

  let extractedFiles = 0;
  let extractedDirectories = 0;
  const createdDirs = new Set<string>();

  for (const entry of entries) {
    let entryName = entry.entryName.replace(/\\/g, '/');
    if (!entryName) {
      continue;
    }

    if (renamedFolder && renameMode) {
      entryName = mapEntryPath(entryName, renamedFolder, renameMode, rootFolder);
    }

    if (entryName.endsWith('/')) {
      const dirSegments = normalizeSegments(entryName);
      if (hasParentTraversal(dirSegments)) {
        return { ...emptyResult(), file: trimmed, message: 'Invalid zip entry path' };
      }

      const dirPath = dirSegments.length > 0 ? path.resolve(extractDir, ...dirSegments) : extractDir;
      if (!isPathWithinDir(dirPath, extractDir)) {
        return { ...emptyResult(), file: trimmed, message: 'Invalid zip entry path' };
      }
      if (!createdDirs.has(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        if (dirSegments.length > 0) {
          extractedDirectories += 1;
        }
        createdDirs.add(dirPath);
      }
      continue;
    }

    const entrySegments = normalizeSegments(entryName);
    if (hasParentTraversal(entrySegments)) {
      return { ...emptyResult(), file: trimmed, message: 'Invalid zip entry path' };
    }

    const destPath = path.resolve(extractDir, ...entrySegments);
    if (!isPathWithinDir(destPath, extractDir)) {
      return { ...emptyResult(), file: trimmed, message: 'Invalid zip entry path' };
    }

    const destDir = path.dirname(destPath);
    if (!createdDirs.has(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      createdDirs.add(destDir);
    }

    fs.writeFileSync(destPath, entry.getData());
    extractedFiles += 1;
  }

  const result: ExtractZipResult = {
    message: '',
    file: trimmed,
    extractedTo,
    extractedFiles,
    extractedDirectories,
  };

  if (renamedFolder && renameMode) {
    result.renamedFolder = renamedFolder;
    result.renameMode = renameMode;
  }

  return result;
};

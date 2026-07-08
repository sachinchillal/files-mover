export type BrowseEntry = { name: string; type: 'file' | 'directory' };

export type BrowseResult = {
  path: string;
  parent: string;
  entries: BrowseEntry[];
  selection: string[];
  message: string;
};

export type LocationFilters = {
  whitelist: string[];
  blacklist: string[];
  selection: string[];
  ignoreNames: Set<string>;
};

export type CopyResult = {
  message: string;
  source: string;
  sources: string[];
  destination: string;
  copiedFiles: number;
  copiedDirectories: number;
  skipped: string[];
};

export type MoveResult = {
  message: string;
  source: string;
  sources: string[];
  destination: string;
  movedFiles: number;
  movedDirectories: number;
  skipped: string[];
};

export type DirectoryLocation = {
  path: string;
  whitelist: string[];
  blacklist: string[];
  selection: string[];
};

export type DirectoryPair = {
  id: string;
  title: string;
  source: DirectoryLocation;
  destination: DirectoryLocation;
  createdAt: number;
  updatedAt: number;
};

export type SettingsData = {
  directories: DirectoryPair[];
};

export type ExtractZipResult = {
  message: string;
  file: string;
  extractedTo: string;
  extractedFiles: number;
  extractedDirectories: number;
  renamedFolder?: string;
  renameMode?: 'replace' | 'wrap';
};

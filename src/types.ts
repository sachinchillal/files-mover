export type BrowseEntry = { name: string; type: 'file' | 'directory' };

export type BrowseResult = {
  path: string;
  parent: string;
  entries: BrowseEntry[];
  message: string;
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

export type DirectoryPair = {
  id: string;
  source: string;
  destination: string;
};

export type SettingsData = {
  directories: DirectoryPair[];
};

import path from 'path';

const DENIED_EXTENSIONS = new Set(['.lock']);

export const isDeniedFile = (name: string): boolean =>
  DENIED_EXTENSIONS.has(path.extname(name).toLowerCase());

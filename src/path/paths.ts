import path from 'path';

export const normalizeSegments = (root: string): string[] =>
  root
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '.');

export const resolveWithinRoot = (baseRoot: string, segments: string[]): string | null => {
  const resolved = path.resolve(baseRoot, ...segments);
  const relative = path.relative(baseRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return resolved;
};

export const hasParentTraversal = (segments: string[]): boolean =>
  segments.some((seg) => seg === '..');

export const isPathUnder = (parentSegments: string[], childSegments: string[]): boolean =>
  childSegments.length >= parentSegments.length &&
  parentSegments.every((seg, index) => childSegments[index] === seg);

export const subfolderName = (segments: string[]): string => {
  if (segments.length === 0) {
    return 'root';
  }
  return segments[segments.length - 1]!;
};

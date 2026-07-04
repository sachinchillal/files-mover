export const parseIgnoreList = (ignore: string | undefined): Set<string> => {
  if (!ignore) {
    return new Set();
  }
  return new Set(
    ignore
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
};

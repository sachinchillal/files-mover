import {
  entryRelativePath,
  filterEntries,
  filterEntryName,
  resolveSelection,
} from '../../src/path/locationFilters';
import type { BrowseEntry, LocationFilters } from '../../src/types';

const emptyFilters = (overrides: Partial<LocationFilters> = {}): LocationFilters => ({
  whitelist: [],
  blacklist: [],
  selection: [],
  ignoreNames: new Set(),
  ...overrides,
});

describe('locationFilters', () => {
  describe('filterEntryName', () => {
    it('allows all names when whitelist is empty and nothing is blocked', () => {
      expect(filterEntryName('readme.md', emptyFilters())).toBe(true);
      expect(filterEntryName('projects', emptyFilters())).toBe(true);
    });

    it('shows only whitelisted names when whitelist is non-empty', () => {
      const filters = emptyFilters({ whitelist: ['README.md'] });
      expect(filterEntryName('README.md', filters)).toBe(true);
      expect(filterEntryName('other.txt', filters)).toBe(false);
    });

    it('hides blacklisted names and ignored names', () => {
      const filters = emptyFilters({
        blacklist: ['secret'],
        ignoreNames: new Set(['node_modules']),
      });
      expect(filterEntryName('secret', filters)).toBe(false);
      expect(filterEntryName('node_modules', filters)).toBe(false);
      expect(filterEntryName('public', filters)).toBe(true);
    });
  });

  describe('filterEntries', () => {
    const entries: BrowseEntry[] = [
      { name: 'a.txt', type: 'file' },
      { name: 'projects', type: 'directory' },
    ];

    it('filters browse entries by name rules', () => {
      const filtered = filterEntries(entries, emptyFilters({ whitelist: ['projects'] }));
      expect(filtered).toEqual([{ name: 'projects', type: 'directory' }]);
    });
  });

  describe('resolveSelection', () => {
    const entries: BrowseEntry[] = [
      { name: 'readme.md', type: 'file' },
      { name: 'projects', type: 'directory' },
      { name: 'invalid-file-type.lock', type: 'file' },
    ];

    it('returns empty array when selection config is empty', () => {
      expect(resolveSelection(entries, '', [], { mode: 'source' })).toEqual([]);
    });

    it('selects all visible source entries when config contains *', () => {
      expect(resolveSelection(entries, '', ['*'], { mode: 'source' })).toEqual([
        'readme.md',
        'projects',
      ]);
    });

    it('matches selection by relative path or bare name', () => {
      const nestedEntries: BrowseEntry[] = [
        { name: 'app', type: 'directory' },
        { name: 'docs', type: 'directory' },
      ];
      expect(resolveSelection(nestedEntries, 'projects', ['app'], { mode: 'source' })).toEqual(['projects/app']);
      expect(resolveSelection(nestedEntries, 'projects', ['projects/docs'], { mode: 'source' })).toEqual([
        'projects/docs',
      ]);
      expect(resolveSelection(entries, '', ['readme.md'], { mode: 'source' })).toEqual(['readme.md']);
    });

    it('selects current folder for destination when config contains *', () => {
      expect(resolveSelection(entries, 'projects', ['*'], { mode: 'destination' })).toEqual(['projects']);
    });

    it('selects first directory at root for destination when config contains *', () => {
      expect(resolveSelection(entries, '', ['*'], { mode: 'destination' })).toEqual(['projects']);
    });

    it('only selects directories in destination mode', () => {
      expect(resolveSelection(entries, '', ['readme.md', 'projects'], { mode: 'destination' })).toEqual([
        'projects',
      ]);
    });
  });

  describe('entryRelativePath', () => {
    it('joins browse path and entry name', () => {
      expect(entryRelativePath('', 'readme.md')).toBe('readme.md');
      expect(entryRelativePath('projects', 'app')).toBe('projects/app');
    });
  });
});

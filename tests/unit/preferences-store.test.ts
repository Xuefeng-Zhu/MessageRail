import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreferencesStore } from '../../src/storage/preferences-store';

describe('PreferencesStore', () => {
  let store: PreferencesStore;

  describe('with chrome.storage.local available', () => {
    let mockStorage: Map<string, unknown>;

    beforeEach(() => {
      mockStorage = new Map();

      (globalThis as any).chrome = {
        storage: {
          local: {
            get: vi.fn((keys: string | string[]) => {
              const keyList = Array.isArray(keys) ? keys : [keys];
              const result: Record<string, unknown> = {};
              for (const k of keyList) {
                if (mockStorage.has(k)) {
                  result[k] = mockStorage.get(k);
                }
              }
              return Promise.resolve(result);
            }),
            set: vi.fn((items: Record<string, unknown>) => {
              for (const [k, v] of Object.entries(items)) {
                mockStorage.set(k, v);
              }
              return Promise.resolve();
            }),
          },
        },
      };

      store = new PreferencesStore();
    });

    afterEach(() => {
      delete (globalThis as any).chrome;
    });

    it('round-trips a value through get and set', async () => {
      await store.set('theme', 'dark');
      const value = await store.get<string>('theme');
      expect(value).toBe('dark');
    });

    it('returns undefined for an unknown key', async () => {
      const value = await store.get<string>('nonexistent');
      expect(value).toBeUndefined();
    });

    it('overwrites an existing value', async () => {
      await store.set('theme', 'dark');
      await store.set('theme', 'light');
      const value = await store.get<string>('theme');
      expect(value).toBe('light');
    });

    it('stores and retrieves different types', async () => {
      await store.set('count', 42);
      await store.set('enabled', true);
      await store.set('tags', ['a', 'b']);

      expect(await store.get<number>('count')).toBe(42);
      expect(await store.get<boolean>('enabled')).toBe(true);
      expect(await store.get<string[]>('tags')).toEqual(['a', 'b']);
    });

    it('calls chrome.storage.local.get with the key', async () => {
      await store.get('myKey');
      expect(chrome.storage.local.get).toHaveBeenCalledWith('myKey');
    });

    it('calls chrome.storage.local.set with the key-value pair', async () => {
      await store.set('myKey', 'myValue');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ myKey: 'myValue' });
    });

    it('returns hardcoded default for sidebarCollapsed when not set in storage', async () => {
      const value = await store.get<boolean>('sidebarCollapsed');
      expect(value).toBe(false);
    });

    it('returns stored value over hardcoded default', async () => {
      await store.set('sidebarCollapsed', true);
      const value = await store.get<boolean>('sidebarCollapsed');
      expect(value).toBe(true);
    });
  });

  describe('without chrome.storage.local (fallback mode)', () => {
    beforeEach(() => {
      // Ensure chrome is not defined
      delete (globalThis as any).chrome;
      store = new PreferencesStore();
    });

    it('returns hardcoded default for known keys', async () => {
      const value = await store.get<boolean>('sidebarCollapsed');
      expect(value).toBe(false);
    });

    it('returns undefined for unknown keys', async () => {
      const value = await store.get<string>('unknownKey');
      expect(value).toBeUndefined();
    });

    it('stores values in memory fallback via set', async () => {
      await store.set('theme', 'dark');
      const value = await store.get<string>('theme');
      expect(value).toBe('dark');
    });

    it('in-memory set overrides hardcoded defaults', async () => {
      await store.set('sidebarCollapsed', true);
      const value = await store.get<boolean>('sidebarCollapsed');
      expect(value).toBe(true);
    });

    it('set does not throw when storage is unavailable', async () => {
      await expect(store.set('key', 'value')).resolves.toBeUndefined();
    });
  });

  describe('with chrome defined but storage.local missing', () => {
    beforeEach(() => {
      (globalThis as any).chrome = {};
      store = new PreferencesStore();
    });

    afterEach(() => {
      delete (globalThis as any).chrome;
    });

    it('falls back to in-memory storage', async () => {
      await store.set('key', 'value');
      const value = await store.get<string>('key');
      expect(value).toBe('value');
    });

    it('returns hardcoded defaults for known keys', async () => {
      const value = await store.get<boolean>('sidebarCollapsed');
      expect(value).toBe(false);
    });
  });

  describe('when chrome.storage.local throws errors', () => {
    beforeEach(() => {
      (globalThis as any).chrome = {
        storage: {
          local: {
            get: vi.fn(() => Promise.reject(new Error('Storage read error'))),
            set: vi.fn(() => Promise.reject(new Error('Storage write error'))),
          },
        },
      };
      store = new PreferencesStore();
    });

    afterEach(() => {
      delete (globalThis as any).chrome;
    });

    it('get falls back to defaults on storage error', async () => {
      const value = await store.get<boolean>('sidebarCollapsed');
      expect(value).toBe(false);
    });

    it('get returns undefined for unknown keys on storage error', async () => {
      const value = await store.get<string>('unknownKey');
      expect(value).toBeUndefined();
    });

    it('set falls back to in-memory on storage error', async () => {
      await store.set('theme', 'dark');
      // The value should be in memory fallback now.
      // To verify, we need to make get also fail so it checks memory.
      // But since chrome.storage.local.get rejects, it will fall through
      // to the memory fallback.
      const value = await store.get<string>('theme');
      expect(value).toBe('dark');
    });
  });
});

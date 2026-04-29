/**
 * Unit tests for keyboard shortcut manifest commands.
 *
 * Verifies that manifest commands don't conflict with reserved browser
 * shortcuts and that expected commands are defined.
 *
 * Validates: Requirements 13.3
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface ManifestCommand {
  suggested_key?: {
    default?: string;
    mac?: string;
    chromeos?: string;
    linux?: string;
    windows?: string;
  };
  description?: string;
}

interface Manifest {
  commands?: Record<string, ManifestCommand>;
}

/** Reserved browser shortcuts that extensions must not override. */
const RESERVED_SHORTCUTS = [
  'Ctrl+F',
  'Cmd+F',
  'Ctrl+T',
  'Cmd+T',
  'Ctrl+W',
  'Cmd+W',
  'Ctrl+N',
  'Cmd+N',
  'Ctrl+L',
  'Cmd+L',
];

describe('Keyboard shortcut manifest commands', () => {
  let manifest: Manifest;
  let allSuggestedKeys: string[];

  beforeAll(() => {
    const manifestPath = resolve(__dirname, '../../manifest.json');
    const raw = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as Manifest;

    // Extract all suggested_key values across all commands and platforms
    allSuggestedKeys = [];
    if (manifest.commands) {
      for (const command of Object.values(manifest.commands)) {
        if (command.suggested_key) {
          for (const key of Object.values(command.suggested_key)) {
            if (typeof key === 'string') {
              allSuggestedKeys.push(key);
            }
          }
        }
      }
    }
  });

  describe('no conflicts with reserved browser shortcuts', () => {
    it.each(RESERVED_SHORTCUTS)(
      'does not use reserved shortcut %s',
      (reserved) => {
        const normalizedReserved = reserved.toLowerCase();
        for (const key of allSuggestedKeys) {
          expect(key.toLowerCase()).not.toBe(normalizedReserved);
        }
      },
    );

    it('none of the suggested keys match any reserved shortcut', () => {
      const reservedLower = RESERVED_SHORTCUTS.map((s) => s.toLowerCase());
      for (const key of allSuggestedKeys) {
        expect(reservedLower).not.toContain(key.toLowerCase());
      }
    });
  });

  describe('expected commands exist', () => {
    it('defines the toggle-sidebar command', () => {
      expect(manifest.commands).toBeDefined();
      expect(manifest.commands!['toggle-sidebar']).toBeDefined();
      expect(manifest.commands!['toggle-sidebar'].suggested_key).toBeDefined();
      expect(manifest.commands!['toggle-sidebar'].description).toBeDefined();
    });

    it('defines the focus-search command', () => {
      expect(manifest.commands).toBeDefined();
      expect(manifest.commands!['focus-search']).toBeDefined();
      expect(manifest.commands!['focus-search'].suggested_key).toBeDefined();
      expect(manifest.commands!['focus-search'].description).toBeDefined();
    });
  });

  describe('suggested keys are valid', () => {
    it('toggle-sidebar has a default suggested key', () => {
      const key = manifest.commands!['toggle-sidebar'].suggested_key!.default;
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key!.length).toBeGreaterThan(0);
    });

    it('focus-search has a default suggested key', () => {
      const key = manifest.commands!['focus-search'].suggested_key!.default;
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key!.length).toBeGreaterThan(0);
    });
  });
});

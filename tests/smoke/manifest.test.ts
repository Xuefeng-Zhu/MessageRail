/**
 * Smoke tests for manifest.json structure.
 *
 * Verifies that the Manifest V3 manifest file has all required fields,
 * correct host permissions, and no overly broad permissions.
 *
 * Validates: Requirements 1.1, 1.4, 1.5
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface Manifest {
  manifest_version?: number;
  name?: string;
  version?: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
  background?: {
    service_worker?: string;
  };
  content_scripts?: Array<{
    matches?: string[];
    js?: string[];
    run_at?: string;
  }>;
  commands?: Record<string, unknown>;
  content_security_policy?: {
    extension_pages?: string;
  };
}

const EXPECTED_HOST_PERMISSIONS = [
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://grok.com/*',
  'https://www.perplexity.com/*',
];

describe('Manifest structure smoke tests', () => {
  let manifest: Manifest;

  beforeAll(() => {
    const manifestPath = resolve(__dirname, '../../manifest.json');
    const raw = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as Manifest;
  });

  describe('required MV3 fields', () => {
    it('manifest_version is 3', () => {
      expect(manifest.manifest_version).toBe(3);
    });

    it('name is present and non-empty', () => {
      expect(manifest.name).toBeDefined();
      expect(typeof manifest.name).toBe('string');
      expect(manifest.name!.length).toBeGreaterThan(0);
    });

    it('version is present and non-empty', () => {
      expect(manifest.version).toBeDefined();
      expect(typeof manifest.version).toBe('string');
      expect(manifest.version!.length).toBeGreaterThan(0);
    });

    it('description is present and non-empty', () => {
      expect(manifest.description).toBeDefined();
      expect(typeof manifest.description).toBe('string');
      expect(manifest.description!.length).toBeGreaterThan(0);
    });
  });

  describe('background service worker', () => {
    it('background.service_worker is defined', () => {
      expect(manifest.background).toBeDefined();
      expect(manifest.background!.service_worker).toBeDefined();
      expect(typeof manifest.background!.service_worker).toBe('string');
      expect(manifest.background!.service_worker!.length).toBeGreaterThan(0);
    });
  });

  describe('content scripts', () => {
    it('content_scripts is defined and non-empty', () => {
      expect(manifest.content_scripts).toBeDefined();
      expect(Array.isArray(manifest.content_scripts)).toBe(true);
      expect(manifest.content_scripts!.length).toBeGreaterThan(0);
    });

    it('content_scripts matches include all 5 provider domains', () => {
      const allMatches = manifest.content_scripts!.flatMap(
        (cs) => cs.matches ?? [],
      );
      for (const expected of EXPECTED_HOST_PERMISSIONS) {
        expect(allMatches).toContain(expected);
      }
    });
  });

  describe('host permissions', () => {
    it('host_permissions includes all 5 provider domains', () => {
      expect(manifest.host_permissions).toBeDefined();
      for (const expected of EXPECTED_HOST_PERMISSIONS) {
        expect(manifest.host_permissions).toContain(expected);
      }
    });

    it('host_permissions does NOT include <all_urls>', () => {
      expect(manifest.host_permissions).toBeDefined();
      expect(manifest.host_permissions).not.toContain('<all_urls>');
    });
  });

  describe('permissions', () => {
    it('permissions includes storage', () => {
      expect(manifest.permissions).toBeDefined();
      expect(manifest.permissions).toContain('storage');
    });
  });

  describe('commands', () => {
    it('commands section exists', () => {
      expect(manifest.commands).toBeDefined();
      expect(typeof manifest.commands).toBe('object');
    });
  });
});

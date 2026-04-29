/**
 * Smoke tests for security constraints.
 *
 * Verifies that the extension's CSP disallows unsafe-eval and remote scripts,
 * and that source code contains no eval(), new Function(), external URLs,
 * or network request APIs.
 *
 * Validates: Requirements 1.6, 11.1, 11.3, 11.4, 11.5
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';

interface Manifest {
  content_security_policy?: {
    extension_pages?: string;
  };
}

/**
 * Recursively collects all .ts files under a directory,
 * excluding node_modules and test directories.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      results.push(...collectTsFiles(fullPath));
    } else if (stat.isFile() && extname(entry) === '.ts') {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Strips single-line (//) and multi-line comments from source code
 * so that URLs or patterns in comments don't trigger false positives.
 */
function stripComments(source: string): string {
  // Remove multi-line comments
  let result = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments
  result = result.replace(/\/\/.*$/gm, '');
  return result;
}

describe('Security constraint smoke tests', () => {
  let manifest: Manifest;
  let sourceFiles: string[];
  let sourceContents: Map<string, string>;

  beforeAll(() => {
    // Load manifest
    const manifestPath = resolve(__dirname, '../../manifest.json');
    const raw = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as Manifest;

    // Collect all .ts source files under src/
    const srcDir = resolve(__dirname, '../../src');
    sourceFiles = collectTsFiles(srcDir);

    // Read all source file contents
    sourceContents = new Map();
    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, 'utf-8');
      sourceContents.set(filePath, content);
    }
  });

  describe('Content Security Policy', () => {
    it('extension_pages CSP contains script-src \'self\'', () => {
      expect(manifest.content_security_policy).toBeDefined();
      const csp = manifest.content_security_policy!.extension_pages;
      expect(csp).toBeDefined();
      expect(csp).toContain("script-src 'self'");
    });

    it('CSP does NOT contain unsafe-eval', () => {
      expect(manifest.content_security_policy).toBeDefined();
      const csp = manifest.content_security_policy!.extension_pages!;
      expect(csp).not.toContain('unsafe-eval');
    });
  });

  describe('no dynamic code execution in source', () => {
    it('no eval() calls in any source file', () => {
      for (const [filePath, content] of sourceContents) {
        const stripped = stripComments(content);
        // Match eval( but not .someeval( or _eval(
        // Use word boundary to avoid matching method names like "retrieval"
        const hasEval = /\beval\s*\(/.test(stripped);
        expect(hasEval, `Found eval() in ${filePath}`).toBe(false);
      }
    });

    it('no new Function() calls in any source file', () => {
      for (const [filePath, content] of sourceContents) {
        const stripped = stripComments(content);
        const hasNewFunction = /\bnew\s+Function\s*\(/.test(stripped);
        expect(
          hasNewFunction,
          `Found new Function() in ${filePath}`,
        ).toBe(false);
      }
    });
  });

  describe('no external URLs in source', () => {
    it('no http:// or https:// URLs in source code (excluding comments)', () => {
      for (const [filePath, content] of sourceContents) {
        const stripped = stripComments(content);
        // Find all URLs in the stripped source
        const urlMatches = stripped.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
        expect(
          urlMatches,
          `Found external URL(s) in ${filePath}: ${urlMatches.join(', ')}`,
        ).toHaveLength(0);
      }
    });
  });

  describe('no network request APIs in source', () => {
    it('no fetch() usage in any source file', () => {
      for (const [filePath, content] of sourceContents) {
        const stripped = stripComments(content);
        const hasFetch = /\bfetch\s*\(/.test(stripped);
        expect(hasFetch, `Found fetch() in ${filePath}`).toBe(false);
      }
    });

    it('no XMLHttpRequest usage in any source file', () => {
      for (const [filePath, content] of sourceContents) {
        const stripped = stripComments(content);
        const hasXHR = /\bXMLHttpRequest\b/.test(stripped);
        expect(
          hasXHR,
          `Found XMLHttpRequest in ${filePath}`,
        ).toBe(false);
      }
    });

    it('no WebSocket usage in any source file', () => {
      for (const [filePath, content] of sourceContents) {
        const stripped = stripComments(content);
        const hasWebSocket = /\bnew\s+WebSocket\s*\(/.test(stripped);
        expect(
          hasWebSocket,
          `Found WebSocket in ${filePath}`,
        ).toBe(false);
      }
    });
  });
});

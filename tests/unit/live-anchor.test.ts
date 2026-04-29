import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLiveAnchor, HIGHLIGHT_CLASS, HIGHLIGHT_DURATION_MS } from '../../src/ui/live-anchor';

/**
 * Unit tests for LiveAnchor.
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */

describe('LiveAnchor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  // ── 1. scrollIntoView uses smooth scrolling ─────────────────────────

  describe('scrollIntoView', () => {
    it('calls element.scrollIntoView with { behavior: "smooth" }', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      // jsdom does not implement scrollIntoView, so we stub it
      el.scrollIntoView = vi.fn();

      const anchor = createLiveAnchor('uid-1', el);
      anchor.scrollIntoView();

      expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    });

    it('applies the highlight class immediately after scrolling', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      el.scrollIntoView = vi.fn();

      const anchor = createLiveAnchor('uid-1', el);
      anchor.scrollIntoView();

      expect(el.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
    });

    it('removes the highlight class after the highlight duration', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      el.scrollIntoView = vi.fn();

      const anchor = createLiveAnchor('uid-1', el);
      anchor.scrollIntoView();

      // Highlight should still be present just before the duration elapses
      vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 1);
      expect(el.classList.contains(HIGHLIGHT_CLASS)).toBe(true);

      // Highlight should be removed after the full duration
      vi.advanceTimersByTime(1);
      expect(el.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
    });
  });

  // ── 2. focusForA11y ─────────────────────────────────────────────────

  describe('focusForA11y', () => {
    it('moves document.activeElement to the target element', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      const anchor = createLiveAnchor('uid-1', el);
      anchor.focusForA11y();

      expect(document.activeElement).toBe(el);
    });

    it('sets tabindex="-1" on the element if not already set', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      expect(el.getAttribute('tabindex')).toBeNull();

      const anchor = createLiveAnchor('uid-1', el);
      anchor.focusForA11y();

      expect(el.getAttribute('tabindex')).toBe('-1');
    });

    it('does not overwrite an existing tabindex', () => {
      const el = document.createElement('div');
      el.setAttribute('tabindex', '0');
      document.body.appendChild(el);

      const anchor = createLiveAnchor('uid-1', el);
      anchor.focusForA11y();

      expect(el.getAttribute('tabindex')).toBe('0');
      expect(document.activeElement).toBe(el);
    });

    it('focuses a focusable child when the element is not an HTMLElement', () => {
      // Simulate a non-HTMLElement container with a focusable child.
      // We use a real <div> as a container and spy on querySelector to
      // return a focusable child, but a more realistic approach is to
      // use an SVG element which is an Element but not HTMLElement.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const button = document.createElement('button');
      svg.appendChild(button);
      document.body.appendChild(svg);

      const anchor = createLiveAnchor('uid-1', svg);
      anchor.focusForA11y();

      expect(document.activeElement).toBe(button);
    });
  });

  // ── 3. Anchor properties ────────────────────────────────────────────

  describe('anchor properties', () => {
    it('exposes the uid and element', () => {
      const el = document.createElement('div');
      const anchor = createLiveAnchor('my-uid', el);

      expect(anchor.uid).toBe('my-uid');
      expect(anchor.element).toBe(el);
    });
  });
});

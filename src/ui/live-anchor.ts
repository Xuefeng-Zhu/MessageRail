import type { LiveAnchor } from '../types';

/**
 * CSS class applied as a temporary visual highlight when scrolling to a message.
 * Applied for at least 1 second after scrollIntoView.
 */
export const HIGHLIGHT_CLASS = 'mr-highlight';

/** Duration in milliseconds for the temporary highlight. */
export const HIGHLIGHT_DURATION_MS = 1000;

/**
 * Focusable element selector used to find a keyboard-focusable child
 * when the target element itself is not an HTMLElement.
 */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]';

/**
 * Creates a LiveAnchor that binds a message UID to a DOM element,
 * providing smooth-scroll navigation and accessibility focus support.
 *
 * @param uid - The message UID this anchor represents.
 * @param element - The DOM element bound to this anchor.
 * @returns A LiveAnchor instance.
 */
export function createLiveAnchor(uid: string, element: Element): LiveAnchor {
  return {
    uid,
    element,

    scrollIntoView(): void {
      element.scrollIntoView({ behavior: 'smooth' });

      // Apply a temporary visual highlight for accessibility (Requirement 7.2)
      if (element instanceof HTMLElement) {
        element.classList.add(HIGHLIGHT_CLASS);
        setTimeout(() => {
          element.classList.remove(HIGHLIGHT_CLASS);
        }, HIGHLIGHT_DURATION_MS);
      }
    },

    focusForA11y(): void {
      if (element instanceof HTMLElement) {
        // Ensure the element is focusable by setting tabindex if not already present
        if (!element.getAttribute('tabindex')) {
          element.setAttribute('tabindex', '-1');
        }
        element.focus();
      } else {
        // For non-HTMLElement (e.g., SVGElement), find a focusable child
        const focusable = element.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable) {
          focusable.focus();
        }
      }
    },
  };
}

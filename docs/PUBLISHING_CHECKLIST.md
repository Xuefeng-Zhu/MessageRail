# Publishing Checklist

## Local Verification

- [ ] Remove private test data from screenshots and fixtures.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run package`.
- [ ] Confirm the ZIP contains `manifest.json` at the root.
- [ ] Load the unpacked extension locally from the repo root and smoke test it.

## Chrome Developer Dashboard

- [ ] Register or sign in to the Chrome Developer Dashboard.
- [ ] Verify developer email.
- [ ] Upload `messagerail-0.1.0.zip`.
- [ ] Fill Store Listing using `docs/CHROME_STORE_LISTING.md`.
- [ ] Add screenshots using synthetic conversations.
- [ ] Fill Privacy tab using the local-only/no-collection language.
- [ ] Add or host the privacy policy from `docs/PRIVACY_POLICY.md`.
- [ ] Add test instructions from `docs/REVIEW_TEST_INSTRUCTIONS.md`.
- [ ] Choose Distribution visibility: Private, Unlisted, or Public.
- [ ] Submit for review.

## Before Public Launch

- [ ] Consider publishing as Unlisted first.
- [ ] Install the reviewed build from the Chrome Web Store link.
- [ ] Test ChatGPT, Claude, Gemini, Grok, and Perplexity.
- [ ] Switch to Public when the reviewed build looks good.

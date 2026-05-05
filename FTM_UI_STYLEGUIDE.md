# FTM Koppensneller UI Style Guide (v1)

This guide defines reusable UI principles for current and future pages in the FTM Koppensneller app.

## Brand Direction
- Editorial, high-contrast, serious.
- Clear hierarchy with strong headlines and compact supporting copy.
- Minimal decoration; emphasis on legibility and trust.

## Core Tokens
- `--ftm-red: #ff6a3b` primary action/accent.
- `--ftm-ink: #101115` primary text.
- `--ftm-deep: #14161b` dark background/hero.
- `--ftm-offwhite: #ede9e2` page background.
- `--ftm-card: #f4f1eb` card surfaces.
- `--ftm-border: #3a3c42` dark borders.

## Typography
- Base font: `"Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif`.
- Display/headline font: condensed style (`"Arial Narrow", "Avenir Next Condensed", "Franklin Gothic Medium", sans-serif`).
- Use short uppercase kicker labels for context.
- Keep body copy concise (`line-height` ~1.4 to 1.5).

## Layout
- Split-screen pattern for primary routes:
  - Left: dark hero with logo, title, short explanation.
  - Right: functional panel with cards/forms.
- Desktop: two-column.
- Mobile: stacked, hero first.

## Components
- Buttons:
  - Primary: filled `--ftm-red`, white text, no rounded corners.
  - Secondary: dark neutral fill.
  - Danger/minor actions: outlined or muted.
- Inputs:
  - Square corners, neutral border, strong focus ring.
- Cards:
  - Light paper-like background (`--ftm-card`), subtle border, deep shadow.

## Voice and Copy
- Dutch UI copy by default.
- Action labels are direct and short.
- Error messages should be explicit and actionable.
- For model behavior notes, be transparent about:
  - which inputs are used,
  - how user feedback is processed,
  - what is planned for future improvement.

## Reuse Checklist For New Pages
- Apply shared tokens from `app/globals.css`.
- Reuse existing shell styles (`ftm-login-*` pattern) or equivalent coach shell styles.
- Keep interaction states visible (loading, success, error).
- Ensure keyboard focus visibility on all interactive elements.
- Keep the page fully usable on mobile widths.

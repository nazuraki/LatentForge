---
name: design-system
description: Use the nazuraki ui-std-lib design system when building or restyling UI in any nazuraki app. Trigger whenever creating pages, components, forms, dialogs, or styling in these repos — the app should consume @nazuraki/styles and @nazuraki/ui-react rather than ad-hoc CSS or one-off components.
---

# Using the nazuraki design system

All nazuraki apps standardize their UX on `ui-std-lib`
(github.com/nazuraki/ui-std-lib). Never write ad-hoc colors, fonts, or
component styles in an app — consume the system.

## Rules

1. **Tokens, not literals.** Use `--nb-*` custom properties for every color,
   font, radius, and spacing value. If a needed token doesn't exist, propose
   adding it to `ui-std-lib` rather than hardcoding.
2. **Existing components first.** Before building UI, check the component
   inventory below. App-local components are only for genuinely app-specific
   composites — and should still be built from `nb-*` classes.
3. **Read the style's `design.md`** (e.g. `styles/neon-butterfly/design.md`)
   before designing new screens — it states the aesthetic rules (when lilac vs
   lime, uppercase conventions, glow-not-shadow elevation).
4. **Gaps go upstream.** A missing component belongs in `ui-std-lib` as a PR,
   not in the app. File an issue on `nazuraki/ui-std-lib` if not building it now.

## Consuming

React apps:

```tsx
import "@nazuraki/styles/neon-butterfly";
import { Button, Card, Dialog, Tabs, Field, Input, Alert } from "@nazuraki/ui-react";
```

Both packages are on the public npm registry — no `.npmrc` needed.

Plain HTML / no-build apps (jsDelivr, pin a tag):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/nazuraki/ui-std-lib@main/styles/neon-butterfly/index.css">
```

Include the JetBrains Mono webfont link (weights 450 + 700) — the system does
not bundle fonts.

## Component inventory

React exports (each renders the matching `nb-*` CSS class, usable directly in
non-React apps):

| React | CSS class | Notes |
| --- | --- | --- |
| `Button` | `.nb-btn` | variants: `primary`, `accent`, `danger` |
| `Card` | `.nb-card` | glass panel |
| `NavLink` | `.nb-link` | chevron + glow hover |
| `Input`/`Textarea`/`Select` | `.nb-input` etc. | pair with `Field`/`Label` |
| `Checkbox`/`Radio`/`Switch` | `.nb-checkbox` etc. | `label` prop wraps in `.nb-choice` |
| `Badge` | `.nb-badge` | semantic variants |
| `Alert` | `.nb-alert` | `variant` + optional `title` |
| `Dialog` | `.nb-dialog` | native `<dialog>`, `open`/`onClose`/`actions` |
| `Tabs` | `.nb-tabs` | `items: {id, label, content}[]` |
| `Progress`/`Spinner` | `.nb-progress`/`.nb-spinner` | |
| — (CSS only) | `.nb-table` | style `<table>` directly |

Visual reference: the GH Pages showcase for this repo renders every component
per style.

## Adding a new style

Copy the `styles/neon-butterfly/` layout: `tokens.css` (same `--nb-*` names,
different values), `base.css`, `components/*.css`, `index.css`, and a
`design.md` capturing the aesthetic. Register it in `site/index.html`'s
`STYLES` array.

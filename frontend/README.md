# LatentForge frontend

React 19 + Vite + TypeScript single-page app, served by the backend in
production (`LATENTFORGE_STATIC_DIR`) and by Vite in development (`just dev`,
which proxies `/api` to the backend on port 19526).

## Design system

The UI consumes the shared nazuraki design system
([ui-std-lib](https://github.com/nazuraki/ui-std-lib)) — theme `neon-butterfly`:

- `@nazuraki/styles` — tokens (`--nb-*`), base styles, and `nb-*` component
  classes. Imported once in `src/main.tsx`; `.nb-bg` on `<body>` in
  `index.html` applies the page background. JetBrains Mono is loaded from
  Google Fonts in `index.html`.
- `@nazuraki/ui-react` — `Button`, `Card`, `Field`/`Input`/`Select`/`Textarea`,
  `Alert`, `Badge`, etc. Tables use the `.nb-table` class directly.

`src/index.css` holds only app layout (brand heading, form rows, table
thumbnails) and uses tokens exclusively — no literal colors or fonts. Don't add
bespoke component styles; if the library lacks something, file an issue on
ui-std-lib. The `design-system` skill in `.claude/skills/` documents the rules.

## Layout

```
src/
  App.tsx            shell: setup → login → dashboard (jobs, workers, admin)
  JobForm.tsx        prompt / model / seed submission
  JobList.tsx        job table with status badges, thumbnails, cancel
  WorkerList.tsx     registered workers and their models
  Login.tsx, Setup.tsx
  Admin.tsx          admin panel; sub-views in admin/ (users, create user, model tags)
  api.ts             typed fetch wrappers for /api
  App.test.tsx       Vitest + Testing Library, fetch stubbed
```

## Commands

```
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build → dist/
npm run lint       # oxlint
npm run typecheck  # tsc -b
npm test           # vitest run
```

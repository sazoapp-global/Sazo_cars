# SAZO Partners — portal app

React + Vite + TypeScript build of `project/SAZO Screens - Partners.dc.html` (P1–P7). Uses sample data, with no backend yet.

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

## Routes

| Design | Route | Notes |
| --- | --- | --- |
| — | `/` | Demo sign-in: pick a portal |
| P1 Garage dashboard | `/garage` | Search, status and staff filters; sort by status |
| P2 Add record | `/garage/records/new` | Odometer check against the last reading, catalogue chips, uploads (progress is simulated), consent, autosaved draft (localStorage) |
| P3 Dealer inventory | `/dealer` | Search, status tabs, "Has findings" toggle, findings alert, copy share link |
| P4 Inspection centre | `/inspection` | Lanes; bulk upload review with "Use" fix-ups, error CSV download, publish |
| P5 Admin review queue | `/admin` | Category filters, case detail, reason required, decisions resolve the case |
| P6 Team & permissions | `/garage/team`, `/dealer/team`, `/inspection/team` | Permissions come from the role; invite dialog |
| P7 Mobile partner | `/garage` under 720 px, `/garage/scan` | Bottom nav, FAB, offline banner. Records saved offline queue up and upload when back online |

Sidebar items that have no design yet open a placeholder page.

## Structure

- `src/styles/app.css` — design tokens (`:root`) and all component styles
- `src/data/mock.ts` — sample data and types (swap for API calls)
- `src/store.tsx` — in-memory store: records, team, online state, toasts
- `src/components/` — `Shell` (sidebar, mobile chrome), badges, stat strip, toasts
- `src/pages/` — one folder per portal

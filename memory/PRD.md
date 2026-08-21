# Railway Block Management System — PRD

## Original Problem Statement
Build a professional responsive Railway Block Management & Corridor Availability App to replace the Excel-based railway block data-entry and corridor-checking system. It must support Block Data Entry User, Officer, and Admin roles; secure login; block creation; automatic duration and corridor validation; free slot finding; calendar/timeline; section and department analysis; cancellation and demanded-vs-allowed reporting; approval workflow; conflict detection; notifications; search; reports; Excel import/export; audit-ready history; and preserve the uploaded workbook's fields and ±30-minute Nearly Corridor rule.

## Architecture Decisions
- React 19 + React Router + Tailwind-compatible CSS for the responsive control-room interface.
- FastAPI + Motor/MongoDB using the protected `MONGO_URL` and `DB_NAME` environment variables.
- JWT bearer sessions with bcrypt-hashed demo credentials and server-side role checks.
- Workbook-derived section, department, line, cancellation, RBP, corridor, and sample block data are seeded into MongoDB.
- Corridor validation is calculated in both the API and live form: strict, nearly ±30m, partial overlap, or completely outside.

## Personas
- Data Entry User: enters and tracks their own block requests.
- Officer: reviews all blocks, validates availability, finds slots, and approves/rejects requests.
- Admin: full operational access and future administration controls.

## Core Requirements
- Role-aware sign-in and protected routes.
- Auto-calculated duration, corridor status, conflict flag, and free slots.
- Approval workflow with pending, approved, rejected, and modification-ready status model.
- Railway-style dashboard with KPIs, section volume, lifecycle, and compliance snapshot.
- Responsive sidebar, searchable block register, slot finder, and calendar/analysis route foundations.
- CSV report export and shareable preview URL.

## Implemented — 2026-08-25
- Secure demo login for ADMIN001, OFFICER001, and USER001.
- Dashboard, new request form, live corridor panel, duration calculator, block registry, search/filter, approval actions, slot finder, slot reuse navigation, access restrictions, CSV export, responsive mobile navigation.
- Workbook fields and corridor examples preserved in seeded data.
- Backend API smoke tests and full browser regression completed with no blocking issues.

## Prioritized Backlog
### P0
- Connect the remaining analysis routes to real aggregated report endpoints.
- Add persistent notification records and audit log viewer.

### P1
- Add Excel upload/import mapping for the workbook's Data Log and Corridor sheets.
- Add PDF/XLSX report generation and admin corridor/dropdown settings.
- Add explicit modification-request modal with required comments.

### P2
- Add month/week calendar event rendering, backup export, user deactivation, and department management screens.

## Next Tasks
1. Build the admin settings and user-management APIs.
2. Add real calendar and department/section aggregation pages.
3. Add Excel import and PDF/XLSX report formats.
# Railway Block Management System — PRD

## Iteration 5–6 (current)
- Officer display name renamed A. Kumar → Sr.DOM (seed upsert, no data loss)
- Live auto-refresh across Dashboard, Blocks, Free Slot Finder, Notifications, Calendar, Analytics
  - 8–10s polling + `rbms:refresh` event bus fired on POST /blocks
- Notification bell dropdown (top nav) with unread pending count
- Calendar / Timeline view (Day) with corridor overlay & coloured status blocks
- Admin Control Panel:
  - /users — create/deactivate users
  - /settings — add/edit corridor timings (start, end, margin)
- Section-wise & Department-wise analytics tables (live)
- Dashboard "Overall compliance" %: divides Strict+Nearly by total of compliance buckets (bounded 0-100%)

## Roles / seed accounts
- ADMIN001 / Admin@123 (Admin Control)
- OFFICER001 / Officer@123 (Sr.DOM)
- USER001 / User@123 (R. Singh)

## Backlog
- P1: True .xlsx import/export (currently CSV)
- P1: Reports page + PDF export
- P2: Demanded vs Allowed vs Availed analysis charts
- P2: Cancellation analysis dedicated page
- P2: Preserve Slot Finder filter state across route navigation (URL params)

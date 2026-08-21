# Railway Block Management System

RBMS is a railway operations workspace for block requests, corridor compliance, officer approvals, and free-slot planning.

## Run locally

### Backend
```bash
cd backend
pip install -r requirements.txt
# Ensure MongoDB is running and backend/.env contains MONGO_URL and DB_NAME
sudo supervisorctl restart backend
```

### Frontend
```bash
cd frontend
yarn install
yarn start
```

The frontend reads `REACT_APP_BACKEND_URL` from `frontend/.env`; do not hard-code API URLs.

## Demo credentials

- `ADMIN001` / `Admin@123`
- `OFFICER001` / `Officer@123`
- `USER001` / `User@123`

These are temporary demo credentials for the seeded environment.

## Shareable preview

https://corridor-slots.preview.emergentagent.com

## Core API routes

- `POST /api/auth/login`
- `GET /api/dashboard`
- `POST /api/blocks`
- `GET /api/blocks`
- `GET /api/slots`
- `PATCH /api/blocks/{id}`
- `GET /api/reports/export`
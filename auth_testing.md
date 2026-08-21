# RBMS Authentication Testing

Use the accounts in `/app/memory/test_credentials.md`.

1. `POST /api/auth/login` with `{ "employee_id": "OFFICER001", "password": "Officer@123" }` should return a bearer token and officer user.
2. `GET /api/auth/me` with `Authorization: Bearer <token>` should return the same user without password data.
3. Login with an incorrect password should return HTTP 401.
4. A data-entry token should be able to create and list its own blocks, but officer-only `/api/slots` should return HTTP 403.
5. An officer token should be able to approve a pending block with `PATCH /api/blocks/{id}`.
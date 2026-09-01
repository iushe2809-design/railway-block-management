"""Iteration 5 regression: name change, admin/RBAC, corridor logic, notifications, live-refresh backing endpoints."""
import os
import time
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _login(eid, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"employee_id": eid, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def sessions():
    out = {}
    for eid, pw in [("ADMIN001", "Admin@123"), ("OFFICER001", "Officer@123"), ("USER001", "User@123")]:
        data = _login(eid, pw)
        s = requests.Session()
        s.headers["Authorization"] = f"Bearer {data['token']}"
        s.user = data["user"]
        out[eid] = s
    return out


# --- name rename verification ---
def test_officer_name_is_srdom(sessions):
    me = sessions["OFFICER001"].get(f"{BASE_URL}/api/auth/me").json()
    assert me["name"] == "Sr.DOM", me


# --- corridor validation buckets ---
@pytest.mark.parametrize("start,end,expected", [
    ("12:15", "14:00", "STRICTLY INSIDE CORRIDOR"),
    ("11:50", "14:00", "NEARLY CORRIDOR"),
    ("06:00", "07:00", "COMPLETELY OUTSIDE CORRIDOR"),
])
def test_corridor_status(sessions, start, end, expected):
    payload = {"date": "2026-09-01", "major_section": "MURI - GDBR", "sub_section": "Sec 1",
               "department": "Engineering", "line": "UP", "description": f"TEST_corridor_{start}",
               "allowed_start": start, "allowed_end": end, "cancellation_type": "Normal",
               "progress": "", "repercussion": "Nil", "is_rbp": False, "remarks": "TEST_"}
    r = sessions["OFFICER001"].post(f"{BASE_URL}/api/blocks", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["block"]["corridor_status"] == expected


# --- RBAC on admin endpoints ---
def test_data_entry_forbidden_admin_users(sessions):
    r = sessions["USER001"].get(f"{BASE_URL}/api/admin/users")
    assert r.status_code == 403


def test_officer_cannot_create_user(sessions):
    r = sessions["OFFICER001"].post(f"{BASE_URL}/api/admin/users", json={
        "employee_id": "TESTQAX", "name": "x", "role": "officer", "department": "Ops", "password": "P@ss1234"})
    assert r.status_code == 403


def test_admin_lists_users(sessions):
    r = sessions["ADMIN001"].get(f"{BASE_URL}/api/admin/users")
    assert r.status_code == 200
    users = r.json()
    assert any(u["employee_id"] == "OFFICER001" and u["name"] == "Sr.DOM" for u in users)


# --- Admin user create/patch ---
def test_admin_create_and_deactivate_user(sessions):
    admin = sessions["ADMIN001"]
    # cleanup if exists via patch not available - create with unique id
    eid = f"TESTQA{int(time.time()) % 100000}"
    r = admin.post(f"{BASE_URL}/api/admin/users", json={
        "employee_id": eid, "name": "Test QA", "role": "officer",
        "department": "Operations", "password": "Test@123"})
    assert r.status_code == 200, r.text
    user_id = r.json()["id"]
    assert r.json()["employee_id"] == eid
    # Verify in listing
    lst = admin.get(f"{BASE_URL}/api/admin/users").json()
    assert any(u["id"] == user_id for u in lst)
    # Deactivate
    p = admin.patch(f"{BASE_URL}/api/admin/users/{user_id}", json={"status": "inactive"})
    assert p.status_code == 200
    lst2 = admin.get(f"{BASE_URL}/api/admin/users").json()
    matched = [u for u in lst2 if u["id"] == user_id][0]
    assert matched["status"] == "inactive"
    # Deactivated user cannot login
    bad = requests.post(f"{BASE_URL}/api/auth/login", json={"employee_id": eid, "password": "Test@123"})
    assert bad.status_code == 403


# --- Corridor admin endpoints ---
def test_admin_corridor_add(sessions):
    admin = sessions["ADMIN001"]
    r = admin.get(f"{BASE_URL}/api/admin/corridors")
    assert r.status_code == 200
    assert len(r.json()) >= 6
    unique = f"TEST-SEC-{int(time.time()) % 100000}"
    c = admin.post(f"{BASE_URL}/api/admin/corridors", json={
        "major_section": unique, "sub_section": "Sec 1", "corridor_start": "12:00",
        "corridor_end": "13:00", "margin_minutes": 30, "active": True})
    assert c.status_code == 200
    assert c.json()["major_section"] == unique
    after = admin.get(f"{BASE_URL}/api/admin/corridors").json()
    assert any(x["major_section"] == unique for x in after)


# --- Notifications reflect new block ---
def test_notifications_include_new_block(sessions):
    officer = sessions["OFFICER001"]
    payload = {"date": "2026-09-02", "major_section": "MURI - GDBR", "sub_section": "Sec 1",
               "department": "Engineering", "line": "UP", "description": "TEST_notif_marker",
               "allowed_start": "12:20", "allowed_end": "13:45", "cancellation_type": "Normal",
               "progress": "", "repercussion": "Nil", "is_rbp": False, "remarks": "TEST_"}
    b = officer.post(f"{BASE_URL}/api/blocks", json=payload).json()["block"]
    n = officer.get(f"{BASE_URL}/api/notifications").json()
    assert len(n) <= 8
    assert any(item["id"] == b["id"] for item in n)


# --- Slots endpoint reflects newly created overlap ---
def test_slots_reflect_new_block(sessions):
    officer = sessions["OFFICER001"]
    date = "2026-09-03"
    section = "MURI - GDBR"
    before = officer.get(f"{BASE_URL}/api/slots", params={
        "date": date, "major_section": section, "line": "UP"}).json()
    slot_10 = next((s for s in before if s["start"] == "10:00" and s["end"] == "12:00"), None)
    assert slot_10 is not None
    assert slot_10["status"] == "Available"
    # Create overlapping block
    officer.post(f"{BASE_URL}/api/blocks", json={
        "date": date, "major_section": section, "sub_section": "Sec 1",
        "department": "Engineering", "line": "UP", "description": "TEST_slot_overlap",
        "allowed_start": "10:00", "allowed_end": "12:00", "cancellation_type": "Normal",
        "progress": "", "repercussion": "Nil", "is_rbp": False, "remarks": "TEST_"})
    after = officer.get(f"{BASE_URL}/api/slots", params={
        "date": date, "major_section": section, "line": "UP"}).json()
    slot_10b = next((s for s in after if s["start"] == "10:00" and s["end"] == "12:00"), None)
    assert slot_10b["status"] == "Occupied"


# --- Blocks list date filter (used by live refresh & calendar) ---
def test_blocks_date_filter(sessions):
    r = sessions["OFFICER001"].get(f"{BASE_URL}/api/blocks", params={"date": "2026-08-18"})
    assert r.status_code == 200
    assert all(b["date"] == "2026-08-18" for b in r.json())
    assert len(r.json()) >= 2

import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def sessions():
    out = {}
    for eid, password in [("OFFICER001", "Officer@123"), ("USER001", "User@123")]:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"employee_id": eid, "password": password})
        assert r.status_code == 200, r.text
        s = requests.Session()
        s.headers["Authorization"] = f"Bearer {r.json()['token']}"
        out[eid] = s
    return out


def test_login_and_me(sessions):
    assert sessions["OFFICER001"].get(f"{BASE_URL}/api/auth/me").json()["role"] == "officer"


def test_bad_login_rejected():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"employee_id": "OFFICER001", "password": "wrong"})
    assert r.status_code == 401


def test_dashboard_shape(sessions):
    data = sessions["OFFICER001"].get(f"{BASE_URL}/api/dashboard").json()
    assert data["total"] >= 3 and "compliance" in data and "hours" in data


def test_data_entry_cannot_find_slots(sessions):
    r = sessions["USER001"].get(f"{BASE_URL}/api/slots", params={"date": "2026-08-25", "major_section": "MURI - GDBR"})
    assert r.status_code == 403


def test_create_pending_strict_and_duration(sessions):
    payload = {"date": "2026-08-25", "major_section": "MURI - GDBR", "sub_section": "Sec 1", "department": "Engineering", "line": "UP", "description": "TEST_regression", "allowed_start": "12:15", "allowed_end": "14:00", "cancellation_type": "Normal", "progress": "", "repercussion": "Nil", "is_rbp": False, "remarks": "TEST_"}
    r = sessions["USER001"].post(f"{BASE_URL}/api/blocks", json=payload)
    assert r.status_code == 200
    block = r.json()["block"]
    assert block["status"] == "PENDING" and block["corridor_status"] == "STRICTLY INSIDE CORRIDOR" and block["duration"] == "1h 45m"
    return block["id"]


def test_slots_and_export(sessions):
    r = sessions["OFFICER001"].get(f"{BASE_URL}/api/slots", params={"date": "2026-08-25", "major_section": "MURI - GDBR"})
    assert r.status_code == 200 and isinstance(r.json(), list)
    x = sessions["OFFICER001"].get(f"{BASE_URL}/api/reports/export")
    assert x.status_code == 200 and "block_id" in x.text

"""Iteration 7 backend tests: audit trail, PDF reports, Excel import."""
import io
import os
import openpyxl
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for eid, pw in [("ADMIN001", "Admin@123"), ("OFFICER001", "Officer@123"), ("USER001", "User@123")]:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"employee_id": eid, "password": pw})
        assert r.status_code == 200, f"{eid} login failed: {r.text}"
        out[eid] = r.json()["token"]
    return out


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---- Audit trail ----
class TestAuditTrail:
    def test_audit_on_submit_and_approve(self, tokens):
        # data_entry submits
        payload = {
            "date": "2026-09-25", "major_section": "MURI - GDBR", "sub_section": "Sec 1",
            "department": "Engineering", "line": "UP", "description": "TEST_audit_trail",
            "allowed_start": "12:15", "allowed_end": "13:30",
            "cancellation_type": "Normal", "progress": "", "repercussion": "Nil",
            "is_rbp": False, "remarks": "TEST_",
        }
        r = requests.post(f"{BASE_URL}/api/blocks", json=payload, headers=_h(tokens["USER001"]))
        assert r.status_code == 200
        block = r.json()["block"]
        bid = block["id"]

        # Audit must contain SUBMITTED
        r2 = requests.get(f"{BASE_URL}/api/blocks/{bid}/audit", headers=_h(tokens["OFFICER001"]))
        assert r2.status_code == 200
        logs = r2.json()
        assert any(l["action"] == "SUBMITTED" for l in logs), logs

        # Officer approves
        r3 = requests.patch(f"{BASE_URL}/api/blocks/{bid}", json={"reason": "APPROVED|ok"},
                            headers=_h(tokens["OFFICER001"]))
        assert r3.status_code == 200

        r4 = requests.get(f"{BASE_URL}/api/blocks/{bid}/audit", headers=_h(tokens["OFFICER001"]))
        actions = [l["action"] for l in r4.json()]
        assert "SUBMITTED" in actions and "APPROVED" in actions, actions


# ---- Report PDF ----
class TestPdfReports:
    @pytest.mark.parametrize("period", ["daily", "weekly", "monthly"])
    def test_pdf_download(self, tokens, period):
        r = requests.get(f"{BASE_URL}/api/reports/pdf", params={"period": period},
                         headers=_h(tokens["OFFICER001"]))
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 500

    def test_invalid_period(self, tokens):
        r = requests.get(f"{BASE_URL}/api/reports/pdf", params={"period": "yearly"},
                         headers=_h(tokens["OFFICER001"]))
        assert r.status_code == 400

    def test_data_entry_forbidden(self, tokens):
        r = requests.get(f"{BASE_URL}/api/reports/pdf", params={"period": "daily"},
                         headers=_h(tokens["USER001"]))
        assert r.status_code == 403


# ---- Excel import ----
def _build_xlsx():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data Log"
    headers = ["Date of block", "Major Section", "Dept", "Line", "Block description",
               "Block allowed from", "Block allowed upto"]
    ws.append(headers)
    ws.append(["2026-09-28", "MURI - GDBR", "Engineering", "UP", "TEST_xlsx_row1", "12:20", "13:40"])
    ws.append(["2026-09-29", "GDBR – CNI", "S&T", "DN", "TEST_xlsx_row2", "10:35", "12:00"])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return buf.getvalue()


class TestExcelImport:
    def test_admin_import_success(self, tokens):
        data = _build_xlsx()
        r = requests.post(f"{BASE_URL}/api/admin/import",
                          files={"file": ("test.xlsx", data,
                                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                          headers=_h(tokens["ADMIN001"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["imported"] == 2, body
        assert "sheet" in body

        # verify blocks appear in list
        r2 = requests.get(f"{BASE_URL}/api/blocks", params={"search": "TEST_xlsx_row1"},
                          headers=_h(tokens["ADMIN001"]))
        assert r2.status_code == 200
        assert any("TEST_xlsx_row1" in b.get("description", "") for b in r2.json())

    def test_officer_cannot_import(self, tokens):
        data = _build_xlsx()
        r = requests.post(f"{BASE_URL}/api/admin/import",
                          files={"file": ("t.xlsx", data, "application/octet-stream")},
                          headers=_h(tokens["OFFICER001"]))
        assert r.status_code == 403

    def test_non_xlsx_rejected(self, tokens):
        r = requests.post(f"{BASE_URL}/api/admin/import",
                          files={"file": ("t.csv", b"a,b,c\n1,2,3\n", "text/csv")},
                          headers=_h(tokens["ADMIN001"]))
        assert r.status_code == 400


# ---- Regression: sanity ----
def test_officer_display_name(tokens):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tokens["OFFICER001"]))
    assert r.status_code == 200
    assert r.json()["name"] == "Sr.DOM"

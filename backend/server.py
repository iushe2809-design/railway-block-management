from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta, date as date_cls
from pathlib import Path
import os, uuid, bcrypt, jwt, io, csv, openpyxl
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
app = FastAPI(title="Railway Block Management System")
api = APIRouter(prefix="/api")
JWT_SECRET = os.environ.get("JWT_SECRET", "rbms-demo-secret-change-me")
ALGO = "HS256"

SECTIONS = ["MURI - GDBR", "GDBR – CNI", "Muri-BRKA", "RNC-LAD", "LAD-TORI", "HTE-MURI DOWN LINE"]
DEPARTMENTS = ["Engineering", "Operations", "S&T", "Electrical", "Mechanical", "Commercial", "Other"]
LINES = ["UP", "DN", "Single", "UP/DN", "Common", "Loop"]

def now(): return datetime.now(timezone.utc).isoformat()
def minutes(value):
    h, m = map(int, value.split(":")); return h * 60 + m
def duration(start, end):
    diff = max(0, minutes(end) - minutes(start)); return f"{diff // 60}h {diff % 60:02d}m"
def corridor_status(start, end, cstart, cend, margin=30):
    s, e, cs, ce = minutes(start), minutes(end), minutes(cstart), minutes(cend)
    if s >= cs and e <= ce: return "STRICTLY INSIDE CORRIDOR"
    if s <= ce and e >= cs and s >= cs - margin and e <= ce + margin: return "NEARLY CORRIDOR"
    if s <= ce and e >= cs: return "PARTIAL OVERLAP"
    return "COMPLETELY OUTSIDE CORRIDOR"

class Login(BaseModel): employee_id: str; password: str
class BlockIn(BaseModel):
    date: str; major_section: str; sub_section: str = "Sec 1"; department: str
    line: str; description: str; demanded_start: str = ""; demanded_end: str = ""
    allowed_start: str; allowed_end: str; cancelled_at: Optional[str] = None
    cancellation_type: str = "Normal"; progress: str = ""; repercussion: str = "Nil"
    is_rbp: bool = False; remarks: str = ""
class Decision(BaseModel): reason: str = ""
class UserIn(BaseModel):
    employee_id: str; name: str; role: str; department: str = "Operations"; password: str = "Welcome@123"
class UserPatch(BaseModel):
    name: Optional[str] = None; role: Optional[str] = None; department: Optional[str] = None
    status: Optional[str] = None; password: Optional[str] = None
class CorridorIn(BaseModel):
    major_section: str; sub_section: str = "Sec 1"; corridor_start: str; corridor_end: str
    margin_minutes: int = 30; active: bool = True

def hash_password(password): return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
def safe_user(user):
    return {"id": user["id"], "employee_id": user["employee_id"], "name": user["name"], "role": user["role"], "department": user.get("department", ""), "status": user.get("status", "active")}
def token(user): return jwt.encode({"sub": user["id"], "exp": datetime.now(timezone.utc) + timedelta(hours=8)}, JWT_SECRET, algorithm=ALGO)

async def audit(block_id: str, actor: dict, action: str, detail: str = ""):
    await db.audit_logs.insert_one({"id": str(uuid.uuid4()), "block_id": block_id, "actor_id": actor["employee_id"], "actor_name": actor["name"], "actor_role": actor["role"], "action": action, "detail": detail, "timestamp": now()})

async def current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "): raise HTTPException(401, "Please sign in")
    try: payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[ALGO])
    except jwt.InvalidTokenError: raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user: raise HTTPException(401, "User not found")
    if user.get("status", "active") != "active": raise HTTPException(403, "Account deactivated")
    return user
def require(*roles):
    async def check(user=Depends(current_user)):
        if user["role"] not in roles: raise HTTPException(403, "This role cannot access this area")
        return user
    return check

async def seed():
    users = [
        ("ADMIN001", "Admin Control", "admin", "Operations", "Admin@123"),
        ("OFFICER001", "Sr.DOM", "officer", "Operations", "Officer@123"),
        ("USER001", "R. Singh", "data_entry", "Engineering", "User@123"),
    ]
    for eid, name, role, dept, password in users:
        existing = await db.users.find_one({"employee_id": eid})
        if not existing:
            await db.users.insert_one({"id": str(uuid.uuid4()), "employee_id": eid, "name": name, "role": role, "department": dept, "password_hash": hash_password(password), "status": "active", "created_at": now()})
        else:
            # keep name current with latest seed (fixes A. Kumar -> Sr.DOM without wiping data)
            if existing.get("name") != name:
                await db.users.update_one({"employee_id": eid}, {"$set": {"name": name}})
    if await db.corridors.count_documents({}) == 0:
        data = [{"id": str(uuid.uuid4()), "major_section": s, "sub_section": f"Sec {i+1}", "corridor_start": a, "corridor_end": b, "margin_minutes": 30, "active": True} for i, (s, a, b) in enumerate([(SECTIONS[0], "12:10", "14:10"), (SECTIONS[1], "10:30", "12:10"), (SECTIONS[2], "10:30", "13:00"), (SECTIONS[3], "08:00", "10:00"), (SECTIONS[4], "14:00", "16:00"), (SECTIONS[5], "10:50", "12:50")])]
        await db.corridors.insert_many(data)
    if await db.blocks.count_documents({}) == 0:
        samples = [("2026-08-18", SECTIONS[0], "Engineering", "UP", "Track maintenance", "12:15", "14:00", "APPROVED", "STRICTLY INSIDE CORRIDOR"), ("2026-08-18", SECTIONS[1], "S&T", "DN", "Signal testing", "10:10", "12:00", "PENDING", "NEARLY CORRIDOR"), ("2026-08-19", SECTIONS[2], "Electrical", "Single", "OHE repair", "10:50", "13:00", "COMPLETED", "STRICTLY INSIDE CORRIDOR")]
        await db.blocks.insert_many([{"id": str(uuid.uuid4()), "block_id": f"RB-{2026+i:04d}", "date": d, "major_section": s, "sub_section": "Sec 1", "department": dept, "line": line, "description": desc, "allowed_start": st, "allowed_end": en, "duration": duration(st, en), "status": status, "corridor_status": cs, "submitted_by": "USER001", "created_at": now(), "cancellation_type": "Normal", "is_rbp": False, "remarks": "Imported from workbook"} for i, (d,s,dept,line,desc,st,en,status,cs) in enumerate(samples)])

@app.on_event("startup")
async def startup(): await seed()

@api.post("/auth/login")
async def login(data: Login):
    user = await db.users.find_one({"employee_id": data.employee_id.upper()}, {"_id": 0})
    if not user or not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()): raise HTTPException(401, "Invalid employee ID or password")
    if user.get("status", "active") != "active": raise HTTPException(403, "This account has been deactivated")
    return {"token": token(user), "user": safe_user(user)}
@api.get("/auth/me")
async def me(user=Depends(current_user)): return safe_user(user)
@api.post("/auth/logout")
async def logout(user=Depends(current_user)): return {"ok": True}

@api.get("/meta")
async def meta(user=Depends(current_user)):
    corridors = await db.corridors.find({}, {"_id": 0}).to_list(100)
    return {"sections": SECTIONS, "departments": DEPARTMENTS, "lines": LINES, "corridors": corridors}
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    blocks = await db.blocks.find({}, {"_id": 0}).to_list(1000)
    today = datetime.now().date().isoformat(); todays = [b for b in blocks if b["date"] == today]
    counts = {k: sum(1 for b in blocks if b["status"] == k) for k in ["APPROVED", "PENDING", "REJECTED", "COMPLETED", "CANCELLED"]}
    return {"total": len(todays) or len(blocks), "active": counts["APPROVED"], "completed": counts["COMPLETED"], "pending": counts["PENDING"], "cancelled": counts["CANCELLED"], "rt": sum(b.get("cancellation_type") == "RT" for b in blocks), "bt": sum(b.get("cancellation_type") == "BT" for b in blocks), "burst": sum(b.get("cancellation_type") == "Burst" for b in blocks), "rbp": sum(b.get("is_rbp", False) for b in blocks), "hours": round(sum(max(0, minutes(b["allowed_end"]) - minutes(b["allowed_start"])) for b in blocks) / 60, 1), "statuses": counts, "sections": [{"name": s, "value": sum(b["major_section"] == s for b in blocks)} for s in SECTIONS], "departments": [{"name": d, "value": sum(b["department"] == d for b in blocks)} for d in DEPARTMENTS], "compliance": [{"name": k, "value": sum(b.get("corridor_status") == k for b in blocks)} for k in ["STRICTLY INSIDE CORRIDOR", "NEARLY CORRIDOR", "PARTIAL OVERLAP", "COMPLETELY OUTSIDE CORRIDOR"]]}
@api.get("/blocks")
async def list_blocks(search: str = "", status: str = "", date: str = "", user=Depends(current_user)):
    query = {} if user["role"] in ["admin", "officer"] else {"submitted_by": user["employee_id"]}
    if status: query["status"] = status
    if date: query["date"] = date
    blocks = await db.blocks.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if search: blocks = [b for b in blocks if search.lower() in str(b).lower()]
    return blocks
@api.post("/blocks")
async def create_block(data: BlockIn, user=Depends(require("admin", "officer", "data_entry"))):
    corridor = await db.corridors.find_one({"major_section": data.major_section}, {"_id": 0})
    if not corridor: raise HTTPException(400, "No corridor timing found for this section")
    status = corridor_status(data.allowed_start, data.allowed_end, corridor["corridor_start"], corridor["corridor_end"])
    conflicts = await db.blocks.find({"date": data.date, "major_section": data.major_section, "line": data.line, "status": {"$in": ["APPROVED", "PENDING"]}}, {"_id": 0}).to_list(50)
    s, e = minutes(data.allowed_start), minutes(data.allowed_end)
    overlap = [b for b in conflicts if minutes(b["allowed_start"]) < e and minutes(b["allowed_end"]) > s]
    doc = data.model_dump(); doc.update({"id": str(uuid.uuid4()), "block_id": f"RB-{datetime.now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}", "duration": duration(data.allowed_start, data.allowed_end), "corridor_status": status, "corridor_start": corridor["corridor_start"], "corridor_end": corridor["corridor_end"], "status": "PENDING", "submitted_by": user["employee_id"], "conflict": bool(overlap), "created_at": now()})
    await db.blocks.insert_one(doc)
    doc.pop("_id", None)
    await audit(doc["id"], user, "SUBMITTED", f"{data.major_section} · {data.allowed_start}-{data.allowed_end} · {data.department}")
    return {"block": doc, "conflicts": overlap}
@api.patch("/blocks/{block_id}")
async def decide(block_id: str, data: Decision, user=Depends(require("admin", "officer"))):
    block = await db.blocks.find_one({"id": block_id}, {"_id": 0})
    if not block: raise HTTPException(404, "Block not found")
    action = data.reason.split("|", 1)[0] if data.reason else "APPROVED"; reason = data.reason.split("|", 1)[1] if "|" in data.reason else ""
    if action not in ["APPROVED", "REJECTED", "MODIFICATION REQUESTED", "COMPLETED", "CANCELLED"]: action = "APPROVED"
    await db.blocks.update_one({"id": block_id}, {"$set": {"status": action, "decision_reason": reason, "approved_by": user["employee_id"], "updated_at": now()}})
    await audit(block_id, user, action, reason or f"{action.title()} by {user['name']}")
    return {"ok": True, "status": action}
@api.get("/blocks/{block_id}/audit")
async def block_audit(block_id: str, user=Depends(current_user)):
    logs = await db.audit_logs.find({"block_id": block_id}, {"_id": 0}).sort("timestamp", 1).to_list(200)
    return logs
@api.get("/slots")
async def slots(date: str, major_section: str, line: str = "UP", min_duration: int = 60, user=Depends(require("admin", "officer"))):
    corridor = await db.corridors.find_one({"major_section": major_section}, {"_id": 0}); blocks = await db.blocks.find({"date": date, "major_section": major_section, "line": line, "status": {"$in": ["APPROVED", "PENDING"]}}, {"_id": 0}).to_list(100)
    windows = [("06:00", "08:00"), ("08:00", "10:00"), ("10:00", "12:00"), ("12:10", "14:10"), ("14:10", "16:00"), ("16:00", "18:00"), ("18:00", "20:00"), ("20:00", "22:00")]
    out=[]
    for st,en in windows:
        occupied=any(minutes(b["allowed_start"]) < minutes(en) and minutes(b["allowed_end"]) > minutes(st) for b in blocks)
        if minutes(en)-minutes(st) >= min_duration: out.append({"start":st,"end":en,"duration":duration(st,en),"status":"Occupied" if occupied else "Available","corridor": bool(corridor and corridor["corridor_start"] <= st <= corridor["corridor_end"])})
    return out
@api.get("/notifications")
async def notifications(user=Depends(current_user)):
    query = {} if user["role"] in ["admin", "officer"] else {"submitted_by": user["employee_id"]}
    latest = await db.blocks.find(query, {"_id": 0}).sort("created_at", -1).to_list(8)
    items = []
    for block in latest:
        title = f"{block['block_id']} · {block['status']}"
        detail = f"{block['major_section']} · {block['allowed_start']}–{block['allowed_end']} · {block['department']}"
        items.append({"id": block["id"], "title": title, "detail": detail, "time": block.get("created_at", "")[:16].replace("T", " "), "type": "warning" if block["status"] == "PENDING" else ("danger" if block["status"] == "REJECTED" else "success"), "status": block["status"]})
    return items
@api.get("/reports/export")
async def export_report(user=Depends(require("admin", "officer"))):
    blocks=await db.blocks.find({}, {"_id":0}).to_list(1000); stream=io.StringIO(); writer=csv.DictWriter(stream, fieldnames=["block_id","date","major_section","department","line","allowed_start","allowed_end","duration","corridor_status","status"]); writer.writeheader(); writer.writerows([{k:b.get(k,"") for k in writer.fieldnames} for b in blocks]); stream.seek(0); return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv", headers={"Content-Disposition":"attachment; filename=railway-block-report.csv"})

# ---- Admin endpoints ----
@api.get("/admin/users")
async def list_users(user=Depends(require("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(200)
    return users
@api.post("/admin/users")
async def create_user(data: UserIn, user=Depends(require("admin"))):
    eid = data.employee_id.upper()
    if await db.users.find_one({"employee_id": eid}): raise HTTPException(400, "Employee ID already exists")
    if data.role not in ["admin", "officer", "data_entry"]: raise HTTPException(400, "Invalid role")
    doc = {"id": str(uuid.uuid4()), "employee_id": eid, "name": data.name, "role": data.role, "department": data.department, "password_hash": hash_password(data.password), "status": "active", "created_at": now()}
    await db.users.insert_one(doc); doc.pop("password_hash", None); doc.pop("_id", None)
    return doc
@api.patch("/admin/users/{user_id}")
async def update_user(user_id: str, data: UserPatch, user=Depends(require("admin"))):
    updates = {k: v for k, v in data.model_dump().items() if v is not None and k != "password"}
    if data.password: updates["password_hash"] = hash_password(data.password)
    if not updates: raise HTTPException(400, "Nothing to update")
    r = await db.users.update_one({"id": user_id}, {"$set": updates})
    if r.matched_count == 0: raise HTTPException(404, "User not found")
    return {"ok": True}

@api.get("/admin/corridors")
async def list_corridors(user=Depends(require("admin"))):
    return await db.corridors.find({}, {"_id": 0}).to_list(200)
@api.post("/admin/corridors")
async def create_corridor(data: CorridorIn, user=Depends(require("admin"))):
    doc = data.model_dump(); doc["id"] = str(uuid.uuid4())
    await db.corridors.insert_one(doc); doc.pop("_id", None)
    return doc
@api.patch("/admin/corridors/{corridor_id}")
async def update_corridor(corridor_id: str, data: CorridorIn, user=Depends(require("admin"))):
    r = await db.corridors.update_one({"id": corridor_id}, {"$set": data.model_dump()})
    if r.matched_count == 0: raise HTTPException(404, "Corridor not found")
    return {"ok": True}

# ---- Reports (PDF) ----
def _period_range(period: str):
    today = datetime.now().date()
    if period == "weekly": start = today - timedelta(days=7)
    elif period == "monthly": start = today - timedelta(days=30)
    else: start = today
    return start.isoformat(), today.isoformat()

@api.get("/reports/pdf")
async def report_pdf(period: str = "daily", user=Depends(require("admin", "officer"))):
    if period not in ("daily", "weekly", "monthly"): raise HTTPException(400, "period must be daily, weekly or monthly")
    start, end = _period_range(period)
    blocks = await db.blocks.find({"date": {"$gte": start, "$lte": end}}, {"_id": 0}).sort("date", 1).to_list(1000)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title=f"RBMS {period.title()} Report", topMargin=28, bottomMargin=28, leftMargin=24, rightMargin=24)
    styles = getSampleStyleSheet()
    story = []
    title = Paragraph(f"<b>Railway Block Management · {period.title()} Report</b>", styles["Title"])
    subtitle = Paragraph(f"Period: <b>{start}</b> → <b>{end}</b> &nbsp; · &nbsp; Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} &nbsp; · &nbsp; Prepared by: {user['name']} ({user['employee_id']})", styles["Normal"])
    story += [title, Spacer(1, 6), subtitle, Spacer(1, 14)]
    # summary
    counts = {k: sum(1 for b in blocks if b.get("status") == k) for k in ["PENDING", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"]}
    total_hours = round(sum(max(0, minutes(b["allowed_end"]) - minutes(b["allowed_start"])) for b in blocks) / 60, 1)
    summary_rows = [["Total blocks", "Pending", "Approved", "Completed", "Rejected", "Cancelled", "Total hours"],
                    [len(blocks), counts["PENDING"], counts["APPROVED"], counts["COMPLETED"], counts["REJECTED"], counts["CANCELLED"], f"{total_hours}h"]]
    st = Table(summary_rows, hAlign="LEFT", colWidths=[80]*7)
    st.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f172a")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#cbd5e1")), ("BACKGROUND", (0,1), (-1,1), colors.HexColor("#f1f5f9")), ("ALIGN", (0,0), (-1,-1), "CENTER"), ("FONTSIZE", (0,0), (-1,-1), 9), ("BOTTOMPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 6)]))
    story += [st, Spacer(1, 18), Paragraph("<b>Block Register</b>", styles["Heading3"])]
    # table
    header = ["Block ID", "Date", "Section", "Dept", "Line", "Window", "Duration", "Corridor", "Status"]
    rows = [header] + [[b.get("block_id",""), b.get("date",""), b.get("major_section",""), b.get("department",""), b.get("line",""), f"{b.get('allowed_start','')}-{b.get('allowed_end','')}", b.get("duration",""), b.get("corridor_status","").replace(" CORRIDOR",""), b.get("status","")] for b in blocks]
    tbl = Table(rows, repeatRows=1, colWidths=[85, 62, 100, 70, 40, 78, 55, 90, 70])
    tbl.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f172a")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8.5), ("GRID", (0,0), (-1,-1), 0.3, colors.HexColor("#e2e8f0")), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]), ("VALIGN", (0,0), (-1,-1), "MIDDLE")]))
    story.append(tbl)
    if not blocks: story.append(Paragraph("<i>No blocks in this period.</i>", styles["Italic"]))
    doc.build(story); buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=rbms-{period}-report.pdf"})

# ---- Excel import (admin) ----
def _norm(v): return "" if v is None else str(v).strip()
def _time(v):
    if v is None: return ""
    if hasattr(v, "strftime"): return v.strftime("%H:%M")
    s = str(v).strip()
    if ":" in s: parts = s.split(":"); return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
    return s
def _date(v):
    if v is None: return ""
    if hasattr(v, "strftime"): return v.strftime("%Y-%m-%d")
    return str(v)[:10]

@api.post("/admin/import")
async def excel_import(file: UploadFile = File(...), user=Depends(require("admin"))):
    if not file.filename.lower().endswith(".xlsx"): raise HTTPException(400, "Please upload a .xlsx file")
    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    except Exception as e:
        raise HTTPException(400, f"Could not read workbook: {e}")
    # Try to find the data-log style sheet automatically
    target_sheet = None
    for name in wb.sheetnames:
        if any(k in name.lower() for k in ["log", "data", "entry", "block"]):
            target_sheet = wb[name]; break
    target_sheet = target_sheet or wb[wb.sheetnames[0]]
    rows = list(target_sheet.iter_rows(values_only=True))
    if not rows: return {"imported": 0, "skipped": 0, "errors": ["Sheet is empty"]}
    # find header row (first row with a "date" cell)
    header_idx = 0
    for i, row in enumerate(rows[:10]):
        joined = " ".join(_norm(c).lower() for c in row if c is not None)
        if "date" in joined and ("section" in joined or "block" in joined): header_idx = i; break
    headers = [_norm(c).lower() for c in rows[header_idx]]
    def col(row, *keys):
        for k in keys:
            for i, h in enumerate(headers):
                if k in h: return row[i]
        return None
    imported, skipped, errors = 0, 0, []
    for row in rows[header_idx + 1:]:
        if not row or all(c is None or _norm(c) == "" for c in row): continue
        d = _date(col(row, "date of block", "date"))
        sec = _norm(col(row, "major section", "section"))
        if not d or not sec: skipped += 1; continue
        start = _time(col(row, "allowed from", "block allowed from", "from"))
        end = _time(col(row, "allowed upto", "block allowed upto", "upto", "to"))
        if not start or not end: skipped += 1; continue
        dept = _norm(col(row, "dept", "department")) or "Other"
        line = _norm(col(row, "line")) or "UP"
        desc = _norm(col(row, "block description", "description")) or "Imported block"
        cancel_type = _norm(col(row, "cancelled rt", "cancellation")) or "Normal"
        remarks = _norm(col(row, "remarks"))
        rbp = "yes" in _norm(col(row, "rbp")).lower()
        corridor = await db.corridors.find_one({"major_section": sec}, {"_id": 0})
        cstatus = corridor_status(start, end, corridor["corridor_start"], corridor["corridor_end"]) if corridor else "UNKNOWN"
        doc = {"id": str(uuid.uuid4()), "block_id": f"RB-IMP-{uuid.uuid4().hex[:6].upper()}", "date": d, "major_section": sec, "sub_section": "Sec 1", "department": dept, "line": line, "description": desc, "allowed_start": start, "allowed_end": end, "duration": duration(start, end), "corridor_status": cstatus, "corridor_start": corridor["corridor_start"] if corridor else "", "corridor_end": corridor["corridor_end"] if corridor else "", "status": "APPROVED", "submitted_by": user["employee_id"], "cancellation_type": cancel_type, "is_rbp": rbp, "remarks": remarks, "created_at": now()}
        try:
            await db.blocks.insert_one(doc)
            await audit(doc["id"], user, "IMPORTED", f"From {file.filename}")
            imported += 1
        except Exception as e:
            errors.append(str(e)); skipped += 1
    return {"imported": imported, "skipped": skipped, "errors": errors[:5], "sheet": target_sheet.title}

@api.get("/")
async def root(): return {"message":"Railway Block Management API"}
app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=[os.environ.get("CORS_ORIGINS", "*")], allow_methods=["*"], allow_headers=["*"])
@app.on_event("shutdown")
async def shutdown(): client.close()

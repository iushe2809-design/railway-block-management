import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import axios from "axios";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { Bell, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, FileBarChart, FileText, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, TrainFront, Upload, UserPlus, Users, X, Route, History } from "lucide-react";
import "@/App.css";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const api = axios.create({ baseURL: API });
const hdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("rbms_token")}` } });

/* ---------- live refresh bus: any component can broadcast "rbms:refresh" ---------- */
const emitRefresh = () => window.dispatchEvent(new CustomEvent("rbms:refresh"));
function useLiveRefresh(callback, intervalMs = 10000) {
  const cb = useRef(callback); cb.current = callback;
  useEffect(() => {
    const run = () => cb.current?.();
    run();
    const id = window.setInterval(run, intervalMs);
    const handler = () => run();
    window.addEventListener("rbms:refresh", handler);
    return () => { window.clearInterval(id); window.removeEventListener("rbms:refresh", handler); };
  }, [intervalMs]);
}

/* ---------- helpers ---------- */
function durationLocal(s, e) {
  const d = Math.max(0, (+e.split(":")[0] * 60 + +e.split(":")[1]) - (+s.split(":")[0] * 60 + +s.split(":")[1]));
  return `${Math.floor(d / 60)}h ${String(d % 60).padStart(2, "0")}m`;
}
function corridorStatusLocal(s, e, cs, ce) {
  const a = +s.slice(0, 2) * 60 + +s.slice(3), b = +e.slice(0, 2) * 60 + +e.slice(3);
  const c = +cs.slice(0, 2) * 60 + +cs.slice(3), d = +ce.slice(0, 2) * 60 + +ce.slice(3);
  if (a >= c && b <= d) return { label: "STRICTLY INSIDE CORRIDOR", color: "green" };
  if (a <= d && b >= c && a >= c - 30 && b <= d + 30) return { label: "NEARLY CORRIDOR", color: "yellow" };
  if (a <= d && b >= c) return { label: "PARTIAL OVERLAP", color: "orange" };
  return { label: "COMPLETELY OUTSIDE CORRIDOR", color: "red" };
}

/* ---------- login ---------- */
function Login({ onLogin }) {
  const [id, setId] = useState("OFFICER001"), [password, setPassword] = useState("Officer@123"), [error, setError] = useState("");
  const submit = async e => {
    e.preventDefault();
    try { const r = await api.post("/auth/login", { employee_id: id, password }); localStorage.setItem("rbms_token", r.data.token); onLogin(r.data.user); }
    catch (err) { setError(err.response?.data?.detail || "Unable to sign in"); }
  };
  return (
    <main className="login-page">
      <div className="login-visual">
        <div className="brand-mark"><TrainFront size={28} /><span>RBMS</span></div>
        <div className="login-copy">
          <p className="eyebrow">OPERATIONS CONTROL / 2026</p>
          <h1>Keep every block<br /><em>inside the corridor.</em></h1>
          <p>One trusted view for safe planning, approval and railway block execution.</p>
        </div>
        <div className="visual-footer"><span>Railway Block Management System</span><span>Secure operations workspace</span></div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-intro"><div className="crest"><ShieldCheck size={22} /></div><div><p className="eyebrow">SIGN IN</p><h2>Welcome back</h2><p>Use your employee credentials to continue.</p></div></div>
        <label>Employee ID<input data-testid="login-employee-id" value={id} onChange={e => setId(e.target.value)} placeholder="e.g. OFFICER001" /></label>
        <label>Password<input data-testid="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" /></label>
        {error && <div data-testid="login-error" className="error-box">{error}</div>}
        <div className="remember">
          <label className="check"><input data-testid="remember-me" type="checkbox" /> <span>Remember me</span></label>
          <button data-testid="forgot-password-button" type="button" className="text-button">Forgot password?</button>
        </div>
        <button data-testid="login-submit-button" className="primary-button wide">Sign in <ChevronRight size={17} /></button>
        <p className="demo-hint" data-testid="demo-credentials-hint">Demo: ADMIN001 · OFFICER001 · USER001</p>
      </form>
    </main>
  );
}

/* ---------- notification bell dropdown ---------- */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  useLiveRefresh(async () => {
    try { const r = await api.get("/notifications", hdr()); setItems(r.data || []); } catch (_) { }
  }, 10000);
  const unread = items.filter(i => i.status === "PENDING").length;
  return (
    <div className="notif-wrap">
      <button data-testid="notifications-button" className="icon-button notification" onClick={() => setOpen(o => !o)}>
        <Bell size={19} />
        {unread > 0 && <span className="notif-badge" data-testid="notif-badge">{unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" data-testid="notif-panel">
          <div className="notif-head"><b>Live notifications</b><small>{items.length} recent events</small></div>
          <div className="notif-list">
            {items.length === 0 && <div className="notif-empty">No notifications yet.</div>}
            {items.map(n => (
              <div key={n.id} className={`notif-item ${n.type}`} data-testid={`notif-item-${n.id}`}>
                <div className={`notif-dot ${n.type}`} />
                <div>
                  <b>{n.title}</b>
                  <small>{n.detail}</small>
                  <small className="notif-time">{n.time || "just now"}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- shell / sidebar ---------- */
function Shell({ user, onLogout, children }) {
  const nav = useNavigate(), loc = useLocation();
  const [mobile, setMobile] = useState(false);
  const items = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "New Block Request", icon: Plus, path: "/new" },
    { label: "My Requests", icon: ClipboardList, path: "/requests" },
    { label: "All Blocks", icon: ClipboardList, path: "/blocks" },
    { label: "Free Slot Finder", icon: Clock3, path: "/slots" },
    { label: "Calendar", icon: CalendarDays, path: "/calendar" },
    { label: "Section Wise", icon: SlidersHorizontal, path: "/sections" },
    { label: "Department Wise", icon: Users, path: "/departments" },
    { label: "Corridor Analysis", icon: ShieldCheck, path: "/corridor" },
    { label: "Reports", icon: FileBarChart, path: "/reports" },
  ];
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="side-brand">
          <div className="brand-symbol"><TrainFront size={19} /></div>
          <div><b>RBMS</b><small>Railway operations</small></div>
          <button data-testid="close-sidebar" className="icon-button mobile-only" onClick={() => setMobile(false)}><X size={18} /></button>
        </div>
        <div className="rail-label">WORKSPACE</div>
        <nav>
          {items.filter(i => !(i.label === "My Requests" && user.role !== "data_entry") && !(i.label === "Free Slot Finder" && user.role === "data_entry")).map(({ label, icon: Icon, path }) =>
            <button data-testid={`nav-${label.toLowerCase().replaceAll(" ", "-")}`} className={loc.pathname === path ? "nav-item active" : "nav-item"} onClick={() => { nav(path); setMobile(false); }} key={label}>
              <Icon size={17} /><span>{label}</span>{label === "New Block Request" && <span className="nav-plus">+</span>}
            </button>
          )}
        </nav>
        {user.role === "admin" && (
          <>
            <div className="rail-label admin-label">ADMINISTRATION</div>
            <button data-testid="nav-user-management" className={loc.pathname === "/users" ? "nav-item active" : "nav-item"} onClick={() => { nav("/users"); setMobile(false); }}><Users size={17} /><span>User Management</span></button>
            <button data-testid="nav-corridor-settings" className={loc.pathname === "/settings" ? "nav-item active" : "nav-item"} onClick={() => { nav("/settings"); setMobile(false); }}><Settings size={17} /><span>Corridor Settings</span></button>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="status-dot"><i /> System operational</div>
          <button data-testid="logout-button" className="logout-button" onClick={onLogout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>
      <section className="main-shell">
        <header className="topbar">
          <button data-testid="open-sidebar" className="icon-button mobile-only" onClick={() => setMobile(true)}><Menu size={20} /></button>
          <div className="crumb"><span>Operations</span><ChevronRight size={14} /><b>{loc.pathname === "/" ? "Dashboard" : items.find(x => x.path === loc.pathname)?.label || (loc.pathname === "/users" ? "User Management" : loc.pathname === "/settings" ? "Corridor Settings" : "Management")}</b></div>
          <div className="top-actions">
            <button data-testid="global-search-button" className="search-trigger" onClick={() => nav("/blocks")}><Search size={17} /><span>Search blocks...</span><kbd>⌘ K</kbd></button>
            <NotificationBell />
            <div className="profile"><div className="avatar">{user.name.split(" ").map(x => x[0]).join("").slice(0, 2)}</div><div><b data-testid="profile-name">{user.name}</b><small>{user.role.replace("_", " ")}</small></div></div>
          </div>
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  );
}

/* ---------- shared badge ---------- */
function Badge({ children }) {
  const s = String(children);
  const c = s.toLowerCase().includes("strict") || s === "APPROVED" || s === "COMPLETED" ? "green"
    : s.includes("NEARLY") || s === "PENDING" ? "yellow"
    : s.includes("OUTSIDE") || s === "REJECTED" ? "red" : "orange";
  return <span data-testid={`status-${s.toLowerCase().replaceAll(" ", "-")}`} className={`badge ${c}`}>{s}</span>;
}

/* ---------- dashboard with live polling ---------- */
function Dashboard({ user }) {
  const [data, setData] = useState(null);
  useLiveRefresh(async () => {
    try { const r = await api.get("/dashboard", hdr()); setData(r.data); } catch (_) { }
  }, 8000);
  if (!data) return <div className="loading" data-testid="dashboard-loading">Loading operational view…</div>;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIVE · UPDATES AUTOMATICALLY</p>
          <h1>Good morning, {user.name.split(" ")[0]}</h1>
          <p className="subhead">Here's the current pulse of your railway block operations.</p>
        </div>
        <button data-testid="new-block-dashboard-button" className="primary-button" onClick={() => window.location.assign("/new")}><Plus size={17} /> New block request</button>
      </div>
      <div className="kpi-grid">
        {[["Total blocks today", data.total, "+12.4%", CalendarDays, "blue"],
          ["Currently active", data.active, "Live now", Clock3, "green"],
          ["Awaiting approval", data.pending, "Needs review", ClipboardList, "yellow"],
          ["Total block hours", `${data.hours}h`, "This month", Clock3, "navy"]].map(([label, value, trend, Icon, color]) =>
          <div className="kpi" data-testid={`kpi-${label.replaceAll(" ", "-")}`} key={label}>
            <div className={`kpi-icon ${color}`}><Icon size={18} /></div>
            <div className="kpi-label">{label}</div><strong>{value}</strong><span className="kpi-trend">{trend}</span>
          </div>
        )}
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-head"><div><p className="eyebrow">VOLUME OVERVIEW</p><h3>Blocks by major section</h3></div><span className="date-chip">Last 30 days <ChevronRight size={13} /></span></div>
          <div className="bars" data-testid="section-block-chart">
            {data.sections.map(x =>
              <div className="bar-row" key={x.name}><span>{x.name}</span><div><i style={{ width: `${Math.max(8, x.value * 22)}%` }} /></div><b>{x.value}</b></div>
            )}
          </div>
        </section>
        <section className="panel compliance-panel">
          <div className="panel-head"><div><p className="eyebrow">CORRIDOR CHECK</p><h3>Compliance snapshot</h3></div><ShieldCheck size={19} color="#16a34a" /></div>
          {data.compliance.map(x =>
            <div className="compliance-row" data-testid={`compliance-${x.name.toLowerCase().replaceAll(" ", "-")}`} key={x.name}>
              <span><i className={`legend ${x.name.includes("STRICT") ? "strict" : x.name.includes("NEARLY") ? "nearly" : x.name.includes("PARTIAL") ? "partial" : "outside"}`} />{x.name.replace(" CORRIDOR", "")}</span><b>{x.value}</b>
            </div>
          )}
          <div className="compliance-foot"><span>Overall compliance</span><strong>{(() => { const total = data.compliance.reduce((s, x) => s + x.value, 0); return total ? Math.round((data.compliance[0].value + data.compliance[1].value) / total * 100) : 0; })()}%</strong></div>
        </section>
      </div>
      <section className="panel status-strip">
        <div><p className="eyebrow">STATUS DISTRIBUTION</p><h3>Block lifecycle</h3></div>
        <div className="status-pills">
          {Object.entries(data.statuses).map(([k, v]) => <div key={k}><Badge>{k}</Badge><b>{v}</b></div>)}
        </div>
      </section>
      <section className="panel dept-panel">
        <div className="panel-head"><div><p className="eyebrow">DEPARTMENT DISTRIBUTION</p><h3>Blocks by department</h3></div></div>
        <div className="dept-grid" data-testid="dept-distribution">
          {data.departments.filter(d => d.value > 0).map(d => (
            <div className="dept-tile" key={d.name}>
              <b>{d.value}</b><span>{d.name}</span>
            </div>
          ))}
          {data.departments.every(d => d.value === 0) && <div className="notif-empty">No department data yet.</div>}
        </div>
      </section>
    </>
  );
}

/* ---------- new block ---------- */
function NewBlock({ user }) {
  const [meta, setMeta] = useState({ sections: [], departments: [], lines: [], corridors: [] });
  const [form, setForm] = useState({ date: "2026-08-25", major_section: "MURI - GDBR", sub_section: "Sec 1", department: user.department || "Engineering", line: "UP", description: "Track maintenance", allowed_start: "12:15", allowed_end: "14:00", cancellation_type: "Normal", progress: "", repercussion: "Nil", is_rbp: false, remarks: "" });
  const [result, setResult] = useState(null);
  useEffect(() => { api.get("/meta", hdr()).then(r => setMeta(r.data)); }, []);
  const corridor = meta.corridors.find(x => x.major_section === form.major_section) || { corridor_start: "12:10", corridor_end: "14:10" };
  const update = (k, v) => setForm({ ...form, [k]: v });
  const submit = async e => {
    e.preventDefault();
    try {
      const r = await api.post("/blocks", form, hdr());
      setResult(r.data);
      emitRefresh();  // broadcast so dashboard/blocks/slots/notifications refresh instantly
    } catch (err) { setResult({ error: err.response?.data?.detail || "Could not save request" }); }
  };
  const status = corridorStatusLocal(form.allowed_start, form.allowed_end, corridor.corridor_start, corridor.corridor_end);
  return (
    <>
      <div className="page-heading compact">
        <div><p className="eyebrow">REQUEST WORKFLOW / STEP 01</p><h1>New block request</h1><p className="subhead">Enter the requested window. Corridor compliance is checked as you type.</p></div>
        <div className="request-id">Draft <b>Not submitted</b></div>
      </div>
      <form className="form-layout" onSubmit={submit}>
        <section className="panel form-panel">
          <div className="panel-head"><div><p className="eyebrow">BLOCK DETAILS</p><h3>Request information</h3></div><span className="required-note">* Required fields</span></div>
          <div className="field-grid">
            <label>Date of block *<input data-testid="block-date-input" type="date" value={form.date} onChange={e => update("date", e.target.value)} /></label>
            <label>Major section *<select data-testid="major-section-select" value={form.major_section} onChange={e => update("major_section", e.target.value)}>{(meta.sections.length ? meta.sections : ["MURI - GDBR"]).map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Sub section<select data-testid="sub-section-select" value={form.sub_section} onChange={e => update("sub_section", e.target.value)}><option>Sec 1</option><option>Sec 2</option><option>Sec 3</option><option>Sec A</option></select></label>
            <label>Department *<select data-testid="department-select" value={form.department} onChange={e => update("department", e.target.value)}>{meta.departments.map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Line *<select data-testid="line-select" value={form.line} onChange={e => update("line", e.target.value)}>{meta.lines.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="span-2">Block description *<input data-testid="block-description-input" value={form.description} onChange={e => update("description", e.target.value)} placeholder="What work will be carried out?" /></label>
          </div>
          <div className="section-divider"><span>Timing details</span></div>
          <div className="field-grid timing-grid">
            <label>Allowed from *<input data-testid="allowed-from-input" type="time" value={form.allowed_start} onChange={e => update("allowed_start", e.target.value)} /></label>
            <label>Allowed upto *<input data-testid="allowed-upto-input" type="time" value={form.allowed_end} onChange={e => update("allowed_end", e.target.value)} /></label>
            <div className="duration-box" data-testid="calculated-duration"><Clock3 size={17} /><span>Calculated duration<strong>{form.allowed_start && form.allowed_end ? durationLocal(form.allowed_start, form.allowed_end) : "—"}</strong></span></div>
          </div>
          <div className="section-divider"><span>Execution details</span></div>
          <div className="field-grid">
            <label>Cancellation type<select data-testid="cancellation-type-select" value={form.cancellation_type} onChange={e => update("cancellation_type", e.target.value)}><option>Normal</option><option>RT</option><option>BT</option><option>Burst</option></select></label>
            <label>Repercussion<select data-testid="repercussion-select" value={form.repercussion} onChange={e => update("repercussion", e.target.value)}><option>Nil</option><option>Minor Delay</option><option>Major Delay</option><option>Cancellation</option><option>Rescheduling</option></select></label>
            <label>Progress made<input data-testid="progress-input" value={form.progress} onChange={e => update("progress", e.target.value)} placeholder="e.g. 1.5 km / 1 signal" /></label>
            <label className="toggle-label"><input data-testid="rbp-checkbox" type="checkbox" checked={form.is_rbp} onChange={e => update("is_rbp", e.target.checked)} /><span>RBP block</span></label>
            <label className="span-2">Remarks<textarea data-testid="remarks-input" value={form.remarks} onChange={e => update("remarks", e.target.value)} placeholder="Add operational notes" /></label>
          </div>
          <div className="form-actions"><span>Dashboard and slot finder refresh automatically after submit</span><button data-testid="submit-block-button" className="primary-button" type="submit"><Check size={17} /> Submit for approval</button></div>
        </section>
        <aside className="validation-rail">
          <div className="panel validation-card">
            <div className="validation-title"><div><p className="eyebrow">LIVE VALIDATION</p><h3>Corridor status</h3></div><span className="pulse" /></div>
            <div className={`validation-status ${status.color}`} data-testid="live-corridor-status">
              <strong>{status.label}</strong><span>Auto-checked against corridor</span>
            </div>
            <div className="corridor-times"><div><small>Corridor opens</small><b>{corridor.corridor_start}</b></div><div><small>Corridor closes</small><b>{corridor.corridor_end}</b></div></div>
            <div className="margin-note"><ShieldCheck size={16} /><span>Nearly Corridor margin<strong>±30 minutes</strong></span></div>
          </div>
          {result && <div className={result.error ? "panel error-box" : "panel success-card"} data-testid="block-submit-result">{result.error || `Request ${result.block.block_id} submitted as PENDING`}</div>}
        </aside>
      </form>
    </>
  );
}

/* ---------- blocks list with expandable audit strip ---------- */
function AuditStrip({ blockId }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get(`/blocks/${blockId}/audit`, hdr()).then(r => alive && setLogs(r.data)).catch(() => alive && setLogs([]));
    return () => { alive = false; };
  }, [blockId]);
  if (logs === null) return <div className="audit-strip loading-strip">Loading audit trail…</div>;
  if (!logs.length) return <div className="audit-strip empty">No audit events for this block yet.</div>;
  return (
    <div className="audit-strip" data-testid={`audit-strip-${blockId}`}>
      {logs.map(l => (
        <div className={`audit-item action-${l.action.toLowerCase().replace(" ", "-")}`} key={l.id}>
          <div className="audit-dot" />
          <div className="audit-body">
            <b>{l.action}</b>
            <span className="audit-who">{l.actor_name} <small>({l.actor_role})</small></span>
            {l.detail && <small>{l.detail}</small>}
            <small className="audit-time">{(l.timestamp || "").replace("T", " ").slice(0, 16)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
function Blocks({ user }) {
  const [blocks, setBlocks] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(null);
  const fetchBlocks = useCallback(async () => {
    try { const r = await api.get(`/blocks?search=${encodeURIComponent(search)}&status=${status}`, hdr()); setBlocks(r.data); } catch (_) { }
  }, [search, status]);
  useLiveRefresh(fetchBlocks, 8000);
  const decide = async (b, action) => {
    let reason = action === "REJECTED" ? (prompt("Rejection reason") || "No reason provided") : "";
    await api.patch(`/blocks/${b.id}`, { reason: `${action}|${reason}` }, hdr());
    emitRefresh();
  };
  const exportCsv = () => {
    fetch(`${API}/reports/export`, hdr())
      .then(r => r.blob())
      .then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "railway-block-report.csv"; a.click(); URL.revokeObjectURL(url); });
  };
  return (
    <>
      <div className="page-heading compact">
        <div><p className="eyebrow">OPERATIONS REGISTER · LIVE</p><h1>{user.role === "data_entry" ? "My requests" : "All blocks"}</h1><p className="subhead">Search, review and action railway block records. Click a row to see who touched it and when.</p></div>
        <button data-testid="export-csv-button" className="secondary-button" onClick={exportCsv}><FileBarChart size={16} /> Export CSV</button>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-input"><Search size={17} /><input data-testid="blocks-search-input" placeholder="Search ID, section, department…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select data-testid="blocks-status-filter" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option><option>COMPLETED</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th></th><th>Block ID</th><th>Date / section</th><th>Department</th><th>Window</th><th>Compliance</th><th>Status</th>{user.role !== "data_entry" && <th>Action</th>}</tr></thead>
            <tbody>
              {blocks.map(b => [
                <tr data-testid={`block-row-${b.block_id}`} key={b.id} className={expanded === b.id ? "row-expanded" : ""}>
                  <td><button data-testid={`toggle-audit-${b.block_id}`} className="icon-action ghost" title="View audit trail" onClick={() => setExpanded(expanded === b.id ? null : b.id)}><History size={15} /></button></td>
                  <td><b className="mono">{b.block_id}</b><small>{b.description}</small></td>
                  <td><b>{b.date}</b><small>{b.major_section} · {b.line}</small></td>
                  <td>{b.department}</td>
                  <td><b>{b.allowed_start} – {b.allowed_end}</b><small>{b.duration}</small></td>
                  <td><Badge>{b.corridor_status}</Badge></td>
                  <td><Badge>{b.status}</Badge></td>
                  {user.role !== "data_entry" && <td>{b.status === "PENDING"
                    ? <div className="row-actions"><button data-testid={`approve-${b.block_id}`} className="icon-action approve" onClick={() => decide(b, "APPROVED")}><Check size={15} /></button><button data-testid={`reject-${b.block_id}`} className="icon-action reject" onClick={() => decide(b, "REJECTED")}><X size={15} /></button></div>
                    : <span className="muted">Reviewed</span>}</td>}
                </tr>,
                expanded === b.id ? (
                  <tr className="audit-row" key={b.id + "-audit"}>
                    <td colSpan={user.role !== "data_entry" ? 8 : 7}><AuditStrip blockId={b.id} /></td>
                  </tr>
                ) : null
              ])}
            </tbody>
          </table>
          {!blocks.length && <div className="empty" data-testid="blocks-empty-state">No blocks match your filters.</div>}
        </div>
      </section>
    </>
  );
}

/* ---------- slot finder ---------- */
const SLOT_PREFS_KEY = "rbms_slot_filters";
function Slots() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SLOT_PREFS_KEY) || "{}"); } catch { return {}; } })();
  const [date, setDate] = useState(saved.date || "2026-08-25");
  const [section, setSection] = useState(saved.section || "MURI - GDBR");
  const [line, setLine] = useState(saved.line || "UP");
  const [slots, setSlots] = useState([]);
  const [meta, setMeta] = useState({ sections: [] });
  useEffect(() => { api.get("/meta", hdr()).then(r => setMeta(r.data)); }, []);
  useEffect(() => { localStorage.setItem(SLOT_PREFS_KEY, JSON.stringify({ date, section, line })); }, [date, section, line]);
  const find = useCallback(async () => {
    try { const r = await api.get(`/slots?date=${date}&major_section=${encodeURIComponent(section)}&line=${line}&min_duration=60`, hdr()); setSlots(r.data); } catch (_) { }
  }, [date, section, line]);
  // auto-run on mount so returning to this page always shows the freshest slots
  useEffect(() => { find(); /* eslint-disable-next-line */ }, []);
  useLiveRefresh(() => { if (date && section) find(); }, 10000);
  return (
    <>
      <div className="page-heading compact">
        <div><p className="eyebrow">PLANNING TOOL · LIVE</p><h1>Free corridor / slot finder</h1><p className="subhead">Find an available operating window in seconds. Your last search is remembered.</p></div>
      </div>
      <section className="panel finder-panel">
        <div className="finder-fields">
          <label>Date<input data-testid="slot-date-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Major section<select data-testid="slot-section-select" value={section} onChange={e => setSection(e.target.value)}>{(meta.sections.length ? meta.sections : [section]).map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Line<select data-testid="slot-line-select" value={line} onChange={e => setLine(e.target.value)}><option>UP</option><option>DN</option><option>Single</option></select></label>
          <button data-testid="find-slots-button" className="primary-button" onClick={find}><Search size={16} /> Find slots</button>
        </div>
      </section>
      {slots.length > 0 &&
        <section className="panel slots-panel">
          <div className="panel-head"><div><p className="eyebrow">AVAILABILITY RESULT · LIVE</p><h3>{section} · {date}</h3></div><span className="result-count">{slots.filter(x => x.status === "Available").length} available windows</span></div>
          <div className="slot-list">
            {slots.map((s, i) =>
              <div className={s.status === "Available" ? "slot-row available" : "slot-row occupied"} data-testid={`slot-row-${i}`} key={i}>
                <div className="slot-time"><Clock3 size={17} /><b>{s.start} – {s.end}</b></div>
                <span>{s.duration}</span>
                <Badge>{s.status}</Badge>
                {s.corridor && <span className="corridor-chip">Inside corridor</span>}
                {s.status === "Available" && <button data-testid={`use-slot-${i}`} className="use-slot" onClick={() => window.location.assign(`/new?start=${s.start}&end=${s.end}`)}>Use this slot <ChevronRight size={15} /></button>}
              </div>
            )}
          </div>
        </section>
      }
    </>
  );
}

/* ---------- calendar / timeline ---------- */
function CalendarView({ user }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [section, setSection] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [meta, setMeta] = useState({ sections: [] });
  useEffect(() => { api.get("/meta", hdr()).then(r => setMeta(r.data)); }, []);
  const fetchBlocks = useCallback(async () => {
    try { const r = await api.get(`/blocks?date=${date}`, hdr()); setBlocks(section ? r.data.filter(b => b.major_section === section) : r.data); } catch (_) { }
  }, [date, section]);
  useLiveRefresh(fetchBlocks, 10000);
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00–24:00
  const timeToPct = t => {
    const m = +t.slice(0, 2) * 60 + +t.slice(3);
    const start = 6 * 60, span = 18 * 60;
    return Math.max(0, Math.min(100, ((m - start) / span) * 100));
  };
  const corridor = meta.corridors?.find(c => c.major_section === section);
  return (
    <>
      <div className="page-heading compact">
        <div><p className="eyebrow">TIMELINE · LIVE</p><h1>Calendar & timeline</h1><p className="subhead">Visualise blocks and corridor windows for any operating day.</p></div>
      </div>
      <section className="panel finder-panel">
        <div className="finder-fields">
          <label>Date<input data-testid="cal-date-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Section<select data-testid="cal-section-select" value={section} onChange={e => setSection(e.target.value)}><option value="">All sections</option>{(meta.sections || []).map(x => <option key={x}>{x}</option>)}</select></label>
          <button data-testid="cal-refresh-button" className="secondary-button" onClick={fetchBlocks}>Refresh</button>
        </div>
      </section>
      <section className="panel timeline-panel">
        <div className="timeline-head">
          {hours.map(h => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}
        </div>
        <div className="timeline-body" data-testid="timeline-body">
          {corridor && section && (
            <div className="timeline-corridor" style={{ left: `${timeToPct(corridor.corridor_start)}%`, width: `${timeToPct(corridor.corridor_end) - timeToPct(corridor.corridor_start)}%` }}>
              <span>Corridor {corridor.corridor_start}–{corridor.corridor_end}</span>
            </div>
          )}
          {blocks.length === 0 && <div className="timeline-empty">No blocks scheduled on this date.</div>}
          {blocks.map(b => {
            const l = timeToPct(b.allowed_start), w = Math.max(2, timeToPct(b.allowed_end) - l);
            const cls = b.status === "APPROVED" ? "green" : b.status === "PENDING" ? "yellow" : b.status === "REJECTED" ? "red" : "orange";
            return (
              <div key={b.id} className={`timeline-block ${cls}`} style={{ left: `${l}%`, width: `${w}%` }} data-testid={`timeline-block-${b.block_id}`} title={`${b.block_id} · ${b.department} · ${b.allowed_start}-${b.allowed_end}`}>
                <b>{b.department}</b><small>{b.allowed_start}–{b.allowed_end}</small>
              </div>
            );
          })}
        </div>
        <div className="timeline-legend">
          <span><i className="dot green" /> Approved</span>
          <span><i className="dot yellow" /> Pending</span>
          <span><i className="dot red" /> Rejected</span>
          <span><i className="dot corridor" /> Corridor window</span>
        </div>
      </section>
    </>
  );
}

/* ---------- section-wise / department-wise analytics ---------- */
function AnalyticsPage({ mode }) {
  const [blocks, setBlocks] = useState([]);
  useLiveRefresh(async () => {
    try { const r = await api.get("/blocks", hdr()); setBlocks(r.data); } catch (_) { }
  }, 10000);
  const groupKey = mode === "section" ? "major_section" : "department";
  const rows = useMemo(() => {
    const map = {};
    for (const b of blocks) {
      const k = b[groupKey] || "Unknown";
      const dur = (+b.allowed_end.slice(0, 2) * 60 + +b.allowed_end.slice(3)) - (+b.allowed_start.slice(0, 2) * 60 + +b.allowed_start.slice(3));
      map[k] = map[k] || { name: k, count: 0, hours: 0, approved: 0, pending: 0, rbp: 0, cancelled: 0 };
      map[k].count++;
      map[k].hours += Math.max(0, dur) / 60;
      if (b.status === "APPROVED" || b.status === "COMPLETED") map[k].approved++;
      if (b.status === "PENDING") map[k].pending++;
      if (b.status === "CANCELLED") map[k].cancelled++;
      if (b.is_rbp) map[k].rbp++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [blocks, groupKey]);
  return (
    <>
      <div className="page-heading compact"><div><p className="eyebrow">{mode === "section" ? "SECTION" : "DEPARTMENT"} INTELLIGENCE · LIVE</p><h1>{mode === "section" ? "Section wise blocks" : "Department wise analysis"}</h1><p className="subhead">Live counts and hours computed as new requests come in.</p></div></div>
      <section className="panel table-panel">
        <div className="table-wrap">
          <table data-testid={`analytics-table-${mode}`}>
            <thead><tr><th>{mode === "section" ? "Section" : "Department"}</th><th>Total blocks</th><th>Total hours</th><th>Avg hrs</th><th>Approved</th><th>Pending</th><th>RBP</th><th>Cancelled</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name} data-testid={`analytics-row-${r.name}`}>
                  <td><b>{r.name}</b></td>
                  <td>{r.count}</td>
                  <td>{r.hours.toFixed(1)}</td>
                  <td>{(r.hours / Math.max(1, r.count)).toFixed(1)}</td>
                  <td>{r.approved}</td>
                  <td>{r.pending}</td>
                  <td>{r.rbp}</td>
                  <td>{r.cancelled}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No block records available yet.</div>}
        </div>
      </section>
    </>
  );
}

/* ---------- admin: user management ---------- */
function UserManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ employee_id: "", name: "", role: "data_entry", department: "Engineering", password: "Welcome@123" });
  const [msg, setMsg] = useState("");
  const load = async () => { try { const r = await api.get("/admin/users", hdr()); setUsers(r.data); } catch (_) { } };
  useEffect(() => { load(); }, []);
  const create = async e => {
    e.preventDefault();
    try { await api.post("/admin/users", form, hdr()); setMsg(`User ${form.employee_id} created`); setForm({ ...form, employee_id: "", name: "" }); load(); }
    catch (err) { setMsg(err.response?.data?.detail || "Could not create user"); }
  };
  const toggle = async u => {
    await api.patch(`/admin/users/${u.id}`, { status: u.status === "active" ? "inactive" : "active" }, hdr());
    load();
  };
  return (
    <>
      <div className="page-heading compact"><div><p className="eyebrow">ADMINISTRATION</p><h1>User management</h1><p className="subhead">Create accounts, assign roles and deactivate users.</p></div></div>
      <section className="panel form-panel">
        <div className="panel-head"><div><p className="eyebrow">ADD USER</p><h3>New account</h3></div><UserPlus size={19} /></div>
        <form onSubmit={create} className="field-grid" data-testid="create-user-form">
          <label>Employee ID *<input data-testid="new-user-id" required value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value.toUpperCase() })} placeholder="USER002" /></label>
          <label>Full name *<input data-testid="new-user-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. P. Sharma" /></label>
          <label>Role<select data-testid="new-user-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="data_entry">Data Entry</option><option value="officer">Officer</option><option value="admin">Admin</option></select></label>
          <label>Department<select data-testid="new-user-dept" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>{["Engineering", "Operations", "S&T", "Electrical", "Mechanical", "Commercial", "Other"].map(d => <option key={d}>{d}</option>)}</select></label>
          <label>Initial password<input data-testid="new-user-password" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
          <div className="form-actions span-2"><span>{msg}</span><button data-testid="create-user-button" className="primary-button" type="submit"><UserPlus size={16} /> Create user</button></div>
        </form>
      </section>
      <section className="panel table-panel">
        <div className="panel-head"><div><p className="eyebrow">DIRECTORY</p><h3>{users.length} accounts</h3></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee ID</th><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} data-testid={`user-row-${u.employee_id}`}>
                  <td><b className="mono">{u.employee_id}</b></td>
                  <td>{u.name}</td>
                  <td><span className="badge blue">{u.role.replace("_", " ")}</span></td>
                  <td>{u.department}</td>
                  <td><Badge>{u.status === "active" ? "APPROVED" : "REJECTED"}</Badge></td>
                  <td><button data-testid={`toggle-user-${u.employee_id}`} className="secondary-button small" onClick={() => toggle(u)}>{u.status === "active" ? "Deactivate" : "Activate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- reports studio ---------- */
function ReportsStudio() {
  const [status, setStatus] = useState("");
  const download = async (period) => {
    setStatus(`Preparing ${period} PDF…`);
    try {
      const res = await fetch(`${API}/reports/pdf?period=${period}`, hdr());
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `rbms-${period}-report.pdf`; a.click();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded ${period} report`);
    } catch (e) { setStatus("Could not generate PDF"); }
  };
  const downloadCsv = async () => {
    const res = await fetch(`${API}/reports/export`, hdr());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "rbms-block-register.csv"; a.click();
    URL.revokeObjectURL(url);
  };
  const cards = [
    { period: "daily", title: "Daily report", subtitle: "Today's blocks & compliance", icon: CalendarDays },
    { period: "weekly", title: "Weekly report", subtitle: "Last 7 days of operations", icon: FileBarChart },
    { period: "monthly", title: "Monthly report", subtitle: "Last 30 days summary + register", icon: FileText },
  ];
  return (
    <>
      <div className="page-heading compact"><div><p className="eyebrow">REPORT STUDIO</p><h1>Reports</h1><p className="subhead">One-click PDF reports, ready to email to officers.</p></div></div>
      <div className="report-grid" data-testid="reports-grid">
        {cards.map(({ period, title, subtitle, icon: Icon }) => (
          <div className="panel report-card" key={period} data-testid={`report-card-${period}`}>
            <div className="report-icon"><Icon size={22} /></div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
            <button className="primary-button" data-testid={`download-${period}-report`} onClick={() => download(period)}><FileText size={15} /> Download PDF</button>
          </div>
        ))}
        <div className="panel report-card csv">
          <div className="report-icon"><FileBarChart size={22} /></div>
          <h3>Block register (CSV)</h3>
          <p>Full block ledger for spreadsheet analysis.</p>
          <button className="secondary-button" data-testid="download-csv-report" onClick={downloadCsv}><FileBarChart size={15} /> Download CSV</button>
        </div>
      </div>
      {status && <div className="panel report-status" data-testid="report-status">{status}</div>}
    </>
  );
}

/* ---------- excel import ---------- */
function ExcelImport() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const upload = async e => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setResult(null);
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await axios.post(`${API}/admin/import`, fd, { headers: { ...hdr().headers, "Content-Type": "multipart/form-data" } });
      setResult(r.data); emitRefresh();
    } catch (err) { setResult({ error: err.response?.data?.detail || "Import failed" }); }
    setBusy(false);
  };
  return (
    <section className="panel form-panel">
      <div className="panel-head"><div><p className="eyebrow">EXCEL ROUND-TRIP</p><h3>Import legacy .xlsx workbook</h3></div><Upload size={19} /></div>
      <form onSubmit={upload} className="import-form" data-testid="excel-import-form">
        <label className="file-drop">
          <Upload size={22} />
          <b>{file ? file.name : "Drop your workbook here or click to browse"}</b>
          <small>.xlsx files with a Data Entry / Data Log sheet</small>
          <input data-testid="excel-file-input" type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <button data-testid="excel-import-button" className="primary-button" disabled={!file || busy}>{busy ? "Importing…" : "Import blocks"}</button>
      </form>
      {result && (
        <div className={result.error ? "error-box" : "success-card"} data-testid="excel-import-result">
          {result.error || `Imported ${result.imported} blocks · skipped ${result.skipped} (sheet: ${result.sheet})`}
        </div>
      )}
    </section>
  );
}

/* ---------- admin: corridor settings ---------- */
function CorridorSettings() {
  const [corridors, setCorridors] = useState([]);
  const [form, setForm] = useState({ major_section: "MURI - GDBR", sub_section: "Sec 1", corridor_start: "12:10", corridor_end: "14:10", margin_minutes: 30, active: true });
  const [msg, setMsg] = useState("");
  const load = async () => { try { const r = await api.get("/admin/corridors", hdr()); setCorridors(r.data); } catch (_) { } };
  useEffect(() => { load(); }, []);
  const save = async e => {
    e.preventDefault();
    try { await api.post("/admin/corridors", form, hdr()); setMsg(`Corridor for ${form.major_section} saved`); load(); }
    catch (err) { setMsg(err.response?.data?.detail || "Could not save corridor"); }
  };
  const updateRow = async (c, key, value) => {
    const next = { ...c, [key]: value };
    setCorridors(corridors.map(x => x.id === c.id ? next : x));
    await api.patch(`/admin/corridors/${c.id}`, next, hdr());
  };
  return (
    <>
      <div className="page-heading compact"><div><p className="eyebrow">ADMINISTRATION</p><h1>Corridor & margin settings</h1><p className="subhead">Configure corridor windows, the ±30 minute Nearly Corridor rule, and import legacy Excel data.</p></div></div>
      <ExcelImport />
      <section className="panel form-panel">
        <div className="panel-head"><div><p className="eyebrow">ADD CORRIDOR</p><h3>New corridor window</h3></div><Route size={19} /></div>
        <form onSubmit={save} className="field-grid" data-testid="create-corridor-form">
          <label>Major section *<input data-testid="corr-section" required value={form.major_section} onChange={e => setForm({ ...form, major_section: e.target.value })} /></label>
          <label>Sub section<input data-testid="corr-sub" value={form.sub_section} onChange={e => setForm({ ...form, sub_section: e.target.value })} /></label>
          <label>Corridor start *<input data-testid="corr-start" type="time" required value={form.corridor_start} onChange={e => setForm({ ...form, corridor_start: e.target.value })} /></label>
          <label>Corridor end *<input data-testid="corr-end" type="time" required value={form.corridor_end} onChange={e => setForm({ ...form, corridor_end: e.target.value })} /></label>
          <label>Margin (mins)<input data-testid="corr-margin" type="number" min={0} max={120} value={form.margin_minutes} onChange={e => setForm({ ...form, margin_minutes: +e.target.value })} /></label>
          <div className="form-actions span-2"><span>{msg}</span><button data-testid="save-corridor-button" className="primary-button" type="submit"><Check size={16} /> Save corridor</button></div>
        </form>
      </section>
      <section className="panel table-panel">
        <div className="panel-head"><div><p className="eyebrow">CORRIDOR REGISTER</p><h3>{corridors.length} corridors</h3></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Section</th><th>Sub</th><th>Start</th><th>End</th><th>Margin</th><th>Active</th></tr></thead>
            <tbody>
              {corridors.map(c => (
                <tr key={c.id} data-testid={`corridor-row-${c.major_section}`}>
                  <td><b>{c.major_section}</b></td>
                  <td>{c.sub_section}</td>
                  <td><input type="time" defaultValue={c.corridor_start} onBlur={e => updateRow(c, "corridor_start", e.target.value)} /></td>
                  <td><input type="time" defaultValue={c.corridor_end} onBlur={e => updateRow(c, "corridor_end", e.target.value)} /></td>
                  <td><input type="number" min={0} max={120} defaultValue={c.margin_minutes} onBlur={e => updateRow(c, "margin_minutes", +e.target.value)} style={{ width: 72 }} /></td>
                  <td><Badge>{c.active ? "APPROVED" : "REJECTED"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- simple stub for /reports and /corridor pages ---------- */
function SimplePage({ title, eyebrow, children }) {
  return (
    <>
      <div className="page-heading compact"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subhead">Operational intelligence for safer, faster block decisions.</p></div></div>
      <section className="panel placeholder-panel">{children || <><div className="placeholder-icon"><CalendarDays size={22} /></div><h3>Workspace ready</h3><p>Use the navigation to review live block records and planning data.</p></>}</section>
    </>
  );
}

/* ---------- root router ---------- */
function AppInner() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const location = useLocation();
  useEffect(() => {
    const t = localStorage.getItem("rbms_token");
    if (t) api.get("/auth/me", { headers: { Authorization: `Bearer ${t}` } }).then(r => setUser(r.data)).catch(() => localStorage.removeItem("rbms_token")).finally(() => setChecking(false));
    else setChecking(false);
  }, []);
  if (checking) return <div className="loading">Opening secure workspace…</div>;
  if (!user) return <Login onLogin={setUser} />;
  const path = location.pathname;
  let page;
  if (path === "/") page = <Dashboard user={user} />;
  else if (path === "/new") page = <NewBlock user={user} />;
  else if (path === "/slots") page = user.role === "data_entry"
    ? <SimplePage title="Access restricted" eyebrow="OFFICER WORKSPACE"><div className="placeholder-icon"><ShieldCheck size={22} /></div><h3>Officer access required</h3><p data-testid="slot-access-denied">Free slot planning is available to officers and administrators.</p></SimplePage>
    : <Slots />;
  else if (path.includes("blocks") || path.includes("requests")) page = <Blocks user={user} />;
  else if (path === "/calendar") page = <CalendarView user={user} />;
  else if (path === "/sections") page = <AnalyticsPage mode="section" />;
  else if (path === "/departments") page = <AnalyticsPage mode="department" />;
  else if (path === "/users") page = user.role === "admin" ? <UserManagement /> : <SimplePage title="Admin access required" eyebrow="ADMINISTRATION"><p data-testid="admin-access-denied">This area is restricted to administrators.</p></SimplePage>;
  else if (path === "/settings") page = user.role === "admin" ? <CorridorSettings /> : <SimplePage title="Admin access required" eyebrow="ADMINISTRATION"><p data-testid="admin-access-denied-settings">This area is restricted to administrators.</p></SimplePage>;
  else if (path === "/reports") page = <ReportsStudio />;
  else page = <SimplePage title="Corridor analysis" eyebrow="ANALYTICS WORKSPACE" />;
  return <Shell user={user} onLogout={() => { localStorage.removeItem("rbms_token"); setUser(null); }}>{page}</Shell>;
}

export default function App() { return <BrowserRouter><AppInner /></BrowserRouter>; }

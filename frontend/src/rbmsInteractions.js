const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

document.addEventListener("click", (event) => {
  const target = event.target.closest?.("[data-testid]");
  if (!target) return;
  if (target.dataset.testid === "new-block-dashboard-button") {
    event.preventDefault();
    event.stopPropagation();
    window.location.assign("/new");
  }
  if (target.dataset.testid === "export-csv-button") {
    event.preventDefault();
    event.stopPropagation();
    const token = localStorage.getItem("rbms_token");
    fetch(`${API}/reports/export`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error("Export unavailable");
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "railway-block-report.csv";
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => window.dispatchEvent(new CustomEvent("rbms-export-error")));
  }
}, true);

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("rbms_token")}` });
const refreshDashboard = async () => {
  if (!localStorage.getItem("rbms_token")) return;
  try {
    const response = await fetch(`${API}/dashboard`, { headers: authHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    const values = [data.total, data.active, data.pending, `${data.hours}h`];
    ["total-blocks-today", "currently-active", "awaiting-approval", "total-block-hours"].forEach((id, index) => {
      const card = document.querySelector(`[data-testid="kpi-${id}"] strong`);
      if (card) card.textContent = values[index];
    });
  } catch (_) { /* transient polling failures should not interrupt the workspace */ }
};

const refreshNotifications = async () => {
  if (!localStorage.getItem("rbms_token")) return;
  try {
    const response = await fetch(`${API}/notifications`, { headers: authHeaders() });
    if (!response.ok) return;
    const items = await response.json();
    const button = document.querySelector('[data-testid="notifications-button"]');
    if (!button) return;
    button.dataset.notificationCount = String(items.length);
    button.title = `${items.length} live notifications`;
  } catch (_) { /* keep the last known notification state */ }
};

window.setInterval(() => {
  refreshDashboard();
  refreshNotifications();
}, 10000);
refreshDashboard();
refreshNotifications();
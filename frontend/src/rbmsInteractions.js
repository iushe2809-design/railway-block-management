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
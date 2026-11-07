// Show a clear badge when development speech responses are mocked.
const badge = document.querySelector("#environmentBadge");

fetch("/api/health", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : null)
  .then((status) => {
    if (status?.mock && badge) badge.hidden = false;
  })
  .catch(() => {});

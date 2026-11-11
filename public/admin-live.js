(() => {
  if (!window.EventSource) return;

  const badge = document.querySelector("[data-enquiry-badge]");
  let toastHost = null;

  function toast(data) {
    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.className = "live-toast-host";
      document.body.appendChild(toastHost);
    }
    const item = document.createElement("div");
    item.className = "live-toast";
    const title = document.createElement("strong");
    title.textContent = "New public enquiry";
    const copy = document.createElement("span");
    copy.textContent = data.name ? `${data.name} — ${data.subject}` : "A visitor sent a message.";
    const link = document.createElement("a");
    link.href = "/admin/enquiries";
    link.textContent = "Open inbox";
    item.append(title, copy, link);
    toastHost.appendChild(item);
    while (toastHost.children.length > 3) toastHost.firstChild.remove();
    setTimeout(() => item.remove(), 12000);
  }

  function refreshInbox() {
    fetch(window.location.href, { headers: { Accept: "text/html" }, credentials: "same-origin" })
      .then((response) => (response.ok ? response.text() : null))
      .then((markup) => {
        if (!markup) return;
        const doc = new DOMParser().parseFromString(markup, "text/html");
        for (const id of ["enquiry-stats", "enquiry-table"]) {
          const fresh = doc.getElementById(id);
          const current = document.getElementById(id);
          if (fresh && current) current.replaceWith(fresh);
        }
      })
      .catch(() => {});
  }

  const source = new EventSource("/admin/live");
  source.addEventListener("enquiry", (event) => {
    let data = {};
    try {
      data = JSON.parse(event.data);
    } catch {
      data = {};
    }
    if (badge) {
      const count = Number(badge.textContent || 0) + 1;
      badge.textContent = String(count);
      badge.hidden = false;
    }
    toast(data);
    if (window.location.pathname === "/admin/enquiries") refreshInbox();
  });
})();

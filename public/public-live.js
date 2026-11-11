(() => {
  if (!window.EventSource) return;
  const containers = document.querySelectorAll("[data-public-live]");
  if (!containers.length) return;

  function card(item) {
    const article = document.createElement("article");
    article.className = "news-card";

    const top = document.createElement("div");
    top.className = "news-card-top";
    const category = document.createElement("span");
    category.className = "news-cat";
    category.textContent = item.category;
    top.appendChild(category);
    if (Number(item.pinned)) {
      const pinned = document.createElement("span");
      pinned.className = "news-pin";
      pinned.textContent = "Pinned";
      top.appendChild(pinned);
    }

    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = `/news/${item.id}`;
    link.textContent = item.title;
    title.appendChild(link);

    const summary = document.createElement("p");
    summary.textContent = item.summary;

    const meta = document.createElement("div");
    meta.className = "news-meta";
    const date = document.createElement("span");
    date.textContent = item.date;
    const read = document.createElement("a");
    read.href = `/news/${item.id}`;
    read.textContent = "Read more →";
    meta.append(date, read);

    article.append(top, title, summary, meta);
    return article;
  }

  function render(container, items) {
    const limit = Number(container.dataset.newsLimit || 3);
    const visible = items.slice(0, limit);
    container.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "news-empty";
      empty.textContent = container.dataset.newsEmpty || "No announcements have been published yet.";
      container.appendChild(empty);
      return;
    }
    visible.forEach((item) => container.appendChild(card(item)));
  }

  function refresh() {
    fetch("/api/public/announcements", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload || !Array.isArray(payload.items)) return;
        containers.forEach((container) => render(container, payload.items));
      })
      .catch(() => {});
  }

  const source = new EventSource("/api/public/live");
  source.addEventListener("announcements", refresh);
})();

document.querySelectorAll("form[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

document.querySelectorAll("[data-account-form]").forEach((form) => {
  const roleSelect = form.querySelector("[data-account-role]");
  const groups = form.querySelectorAll("[data-role-group]");
  const guardianSelect = form.querySelector("[data-guardian-mode]");
  const guardianFields = form.querySelectorAll("[data-guardian-field]");
  const roleKind = () => {
    const role = roleSelect ? roleSelect.value : "teacher";
    return role === "student" ? "student" : role === "parent" ? "parent" : "staff";
  };
  const syncRole = () => {
    const kind = roleKind();
    groups.forEach((group) => {
      group.hidden = group.dataset.roleGroup !== kind;
    });
    syncGuardian();
  };
  const syncGuardian = () => {
    if (!guardianSelect || roleKind() !== "student") {
      guardianFields.forEach((field) => {
        field.hidden = true;
      });
      return;
    }
    guardianFields.forEach((field) => {
      field.hidden = field.dataset.guardianField !== guardianSelect.value;
    });
  };
  if (roleSelect) roleSelect.addEventListener("change", syncRole);
  if (guardianSelect) guardianSelect.addEventListener("change", syncGuardian);
  syncRole();
});

document.querySelectorAll("[data-kind-form]").forEach((form) => {
  const select = form.querySelector('[name="kind"]');
  if (!select) return;
  const groups = {
    file: form.querySelector('[data-kind-field="file"]'),
    link: form.querySelector('[data-kind-field="link"]'),
    note: form.querySelector('[data-kind-field="note"]'),
  };
  const sync = () => {
    Object.entries(groups).forEach(([kind, field]) => {
      if (!field) return;
      field.hidden = kind !== select.value;
    });
  };
  select.addEventListener("change", sync);
  sync();
});

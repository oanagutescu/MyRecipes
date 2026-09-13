"use strict";

/* =========================================================
   Admin screen: language + accent color + category/data management
   ========================================================= */
const ACCENT_COLOR_CHOICES = [
  "#007aff", "#ff3b30", "#ff9500", "#ffcc00", "#34c759",
  "#00c7be", "#30b0c7", "#32ade6", "#5856d6", "#af52de", "#ff2d55"
];

async function renderAdminScreen() {
  const container = document.getElementById("admin-content");
  if (!container) return;
  const isRo = I18N.lang === "ro";

  async function draw() {
    const currentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

    container.innerHTML = "";

    const langHeader = document.createElement("div");
    langHeader.className = "group-header";
    langHeader.textContent = I18N.t("admin.language");
    container.appendChild(langHeader);

    const langRow = document.createElement("div");
    langRow.className = "lang-switch-row";
    langRow.innerHTML =
      '<button class="lang-switch-btn' + (I18N.lang === "en" ? " active" : "") + '" data-lang="en">English</button>' +
      '<button class="lang-switch-btn' + (I18N.lang === "ro" ? " active" : "") + '" data-lang="ro">Română</button>';
    container.appendChild(langRow);
    langRow.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.addEventListener("click", () => {
        I18N.setLang(btn.dataset.lang);
        DB.put("settings", { id: "lang", value: btn.dataset.lang });
        draw();
      });
    });

    const colorHeader = document.createElement("div");
    colorHeader.className = "group-header";
    colorHeader.textContent = I18N.t("admin.accentColor");
    container.appendChild(colorHeader);

    const colorRow = document.createElement("div");
    colorRow.className = "color-swatch-grid";
    ACCENT_COLOR_CHOICES.forEach((hex) => {
      const sw = document.createElement("div");
      sw.className = "color-swatch" + (hex.toLowerCase() === currentColor.toLowerCase() ? " selected" : "");
      sw.style.background = hex;
      sw.addEventListener("click", () => {
        window.setAccentColor(hex);
        draw();
      });
      colorRow.appendChild(sw);
    });
    container.appendChild(colorRow);

    const catHeader = document.createElement("div");
    catHeader.className = "group-header";
    catHeader.textContent = I18N.t("admin.categoryManagement");
    container.appendChild(catHeader);

    const catCard = document.createElement("div");
    catCard.className = "list-card";

    const recCatRow = document.createElement("div");
    recCatRow.className = "list-row tappable";
    recCatRow.innerHTML = '<span class="row-title">' + escapeHtml(I18N.t("admin.manageRecipeCategories")) + '</span><span class="chevron">\u203A</span>';
    recCatRow.addEventListener("click", () => openCategoryManageScreen("recipe"));
    catCard.appendChild(recCatRow);

    const ingCatRow = document.createElement("div");
    ingCatRow.className = "list-row tappable";
    ingCatRow.innerHTML = '<span class="row-title">' + escapeHtml(I18N.t("admin.manageIngredientCategories")) + '</span><span class="chevron">\u203A</span>';
    ingCatRow.addEventListener("click", () => openCategoryManageScreen("ingredient"));
    catCard.appendChild(ingCatRow);

    container.appendChild(catCard);

    const dataHeader = document.createElement("div");
    dataHeader.className = "group-header";
    dataHeader.textContent = I18N.t("admin.dataManagement");
    container.appendChild(dataHeader);

    const dataCard = document.createElement("div");
    dataCard.className = "list-card";

    const exportRow = document.createElement("div");
    exportRow.className = "add-row";
    exportRow.textContent = "\u2B06\uFE0F " + I18N.t("admin.exportData");
    exportRow.addEventListener("click", exportAllData);
    dataCard.appendChild(exportRow);

    const importRow = document.createElement("div");
    importRow.className = "add-row";
    importRow.textContent = "\u2B07\uFE0F " + I18N.t("admin.importData");
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.style.display = "none";
    importRow.appendChild(importInput);
    importRow.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => {
      const file = importInput.files && importInput.files[0];
      if (file) importAllData(file);
      importInput.value = "";
    });
    dataCard.appendChild(importRow);

    container.appendChild(dataCard);
  }

  await draw();
}
window.renderAdminScreen = renderAdminScreen;

/* =========================================================
   Category management: rename, reorder (up/down), delete, add
   ========================================================= */
function openCategoryManageScreen(kind) {
  const isRo = I18N.lang === "ro";
  const title = kind === "recipe" ? I18N.t("admin.recipeCategories") : I18N.t("admin.ingredientCategories");
  const screen = pushScreen({
    title,
    left: { label: isRo ? "Închide" : "Close" },
    async render(content, refresh) {
      const cats = await getCategoriesSorted(kind);
      content.innerHTML = "";

      const card = document.createElement("div");
      card.className = "list-card";
      cats.forEach((cat) => {
        const row = document.createElement("div");
        row.className = "category-manage-row";
        row._cat = cat;
        row.innerHTML =
          '<span class="cat-drag-handle">\u2630</span>' +
          '<span class="cat-icon">' + (cat.icon || "") + '</span>' +
          '<input type="text" value="' + escapeAttr(cat.name) + '" />' +
          '<button class="cat-delete-btn">\uD83D\uDDD1\uFE0F</button>';

        const input = row.querySelector("input");
        input.addEventListener("change", async () => {
          const val = input.value.trim();
          if (!val) return;
          cat.name = val;
          cat.updatedAt = nowISO();
          await DB.put(getCategoryStore(kind), cat);
        });

        row.querySelector(".cat-delete-btn").addEventListener("click", async () => {
          if (!confirm(I18N.t("admin.deleteCategoryConfirm"))) return;
          await DB.delete(getCategoryStore(kind), cat.id);
          refresh();
        });

        const handle = row.querySelector(".cat-drag-handle");
        handle.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          let startY = e.clientY;
          row.classList.add("dragging");

          const onMove = (ev) => {
            ev.preventDefault();
            const deltaY = ev.clientY - startY;
            row.style.transform = "translateY(" + deltaY + "px)";

            const rows = Array.from(card.children);
            const rowIndex = rows.indexOf(row);
            const rowRect = row.getBoundingClientRect();
            const rowCenter = rowRect.top + rowRect.height / 2;

            for (const sibling of rows) {
              if (sibling === row) continue;
              const siblingIndex = rows.indexOf(sibling);
              const sibRect = sibling.getBoundingClientRect();
              const sibCenter = sibRect.top + sibRect.height / 2;
              if (rowIndex > siblingIndex && rowCenter < sibCenter) {
                card.insertBefore(row, sibling);
                startY -= sibRect.height;
                break;
              } else if (rowIndex < siblingIndex && rowCenter > sibCenter) {
                card.insertBefore(row, sibling.nextSibling);
                startY += sibRect.height;
                break;
              }
            }
          };

          const onUp = async () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            row.classList.remove("dragging");
            row.style.transform = "";

            const rows = Array.from(card.querySelectorAll(".category-manage-row"));
            const updates = [];
            rows.forEach((r, i) => {
              if (r._cat.sortOrder !== i) {
                r._cat.sortOrder = i;
                r._cat.updatedAt = nowISO();
                updates.push(r._cat);
              }
            });
            for (const c of updates) {
              await DB.put(getCategoryStore(kind), c);
            }
          };

          document.addEventListener("pointermove", onMove, { passive: false });
          document.addEventListener("pointerup", onUp);
        });

        card.appendChild(row);
      });
      content.appendChild(card);

      const addRow = document.createElement("div");
      addRow.className = "add-row";
      addRow.textContent = "+ " + I18N.t("admin.addCategory");
      addRow.addEventListener("click", () => {
        openNewCategoryScreen(kind, () => refresh());
      });
      content.appendChild(addRow);
    }
  });
  return screen;
}
window.openCategoryManageScreen = openCategoryManageScreen;

const ADMIN_DATA_STORES = ["recipes", "ingredients", "recipeCategories", "ingredientCategories", "menus", "cookingSessions", "settings", "shoppingList"];

async function exportAllData() {
  const data = {};
  for (const storeName of ADMIN_DATA_STORES) {
    data[storeName] = await DB.getAll(storeName);
  }
  const payload = {
    app: "MyRecipes",
    exportedAt: nowISO(),
    version: 1,
    data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = "myrecipes-backup-" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  alert(I18N.t("admin.exportSuccess"));
}
window.exportAllData = exportAllData;

async function importAllData(file) {
  if (!confirm(I18N.t("admin.importConfirm"))) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || typeof data !== "object") throw new Error("Invalid backup file");

    for (const storeName of ADMIN_DATA_STORES) {
      await DB.clear(storeName);
      const records = Array.isArray(data[storeName]) ? data[storeName] : [];
      for (const record of records) {
        await DB.put(storeName, record);
      }
    }

    alert(I18N.t("admin.importSuccess"));
    window.location.reload();
  } catch (err) {
    console.error("Import failed:", err);
    alert(I18N.t("admin.importError"));
  }
}
window.importAllData = importAllData;

/* =========================================================
   Tab activation hook: render lists + manage nav "+" button
   ========================================================= */
window.onTabActivated = function (tabName) {
  const rightBtn = document.getElementById("nav-right-btn");
  if (!rightBtn) return;
  rightBtn.onclick = null;
  if (tabName === "ingredients") {
    rightBtn.style.display = "inline-flex";
    rightBtn.textContent = "+";
    rightBtn.onclick = () => openIngredientEditor(null, renderIngredientsScreen);
    renderIngredientsScreen();
  } else if (tabName === "recipes") {
    rightBtn.style.display = "inline-flex";
    rightBtn.textContent = "+";
    rightBtn.onclick = () => openRecipeEditor(null, renderRecipesScreen);
    renderRecipesScreen();
  } else if (tabName === "shopping") {
    rightBtn.style.display = "inline-flex";
    rightBtn.textContent = "+";
    rightBtn.onclick = () => addAdhocShoppingItem(renderShoppingScreen);
    renderShoppingScreen();
  } else if (tabName === "menus" && typeof window.onMenusTabActivated === "function") {
    window.onMenusTabActivated(rightBtn);
  } else if (tabName === "admin") {
    rightBtn.style.display = "none";
    renderAdminScreen();
  } else {
    rightBtn.style.display = "none";
  }
};

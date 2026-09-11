  (function () {
    "use strict";

    /* =========================================================
       Categories
       ========================================================= */
    const FOOD_EMOJIS = [
      "🍎", "🍌", "🍇", "🍓", "🍊", "🍋", "🍉", "🍒", "🍑", "🥝",
      "🥑", "🥕", "🥦", "🌽", "🥔", "🧄", "🧅", "🥬", "🍅", "🥒",
      "🍞", "🧀", "🥚", "🥛", "🍗", "🥩", "🐟", "🍚", "🍝", "🌶️"
    ];

  function getCategoryStore(kind) {
    return kind === "recipe" ? "recipeCategories" : "ingredientCategories";
  }

  async function getCategoriesSorted(kind) {
    const list = await DB.getAll(getCategoryStore(kind));
    return list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  window.getCategoriesSorted = getCategoriesSorted;
  window.getCategoryStore = getCategoryStore;

  async function createCategory(kind, name, icon) {
    const store = getCategoryStore(kind);
    const cats = await DB.getAll(store);
    const maxOrder = cats.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), -1);
    const cat = { id: uuid(), name, icon, sortOrder: maxOrder + 1, updatedAt: nowISO() };
    await DB.put(store, cat);
    return cat;
  }
  window.createCategory = createCategory;

  function openNewCategoryScreen(kind, onCreated, prefillName) {
    let selectedEmoji = FOOD_EMOJIS[0];
    let currentName = prefillName || "";
    const isRo = I18N.lang === "ro";
    const screen = pushScreen({
      title: isRo ? "Categorie nouă" : "New Category",
      left: { label: isRo ? "Anulează" : "Cancel" },
      right: {
        label: isRo ? "Salvează" : "Save",
        action: async (close) => {
          const nameInput = screen.element.querySelector("#cat-name");
          const customInput = screen.element.querySelector("#cat-custom-emoji");
          const name = (nameInput.value || currentName).trim();
          if (!name) { nameInput.focus(); return; }
          const icon = (customInput.value.trim() || selectedEmoji);
          const cat = await createCategory(kind, name, icon);
          close();
          onCreated && onCreated(cat);
        }
      },
      render(content) {
        content.innerHTML =
          '<div class="form-row"><label>' + (isRo ? "Nume" : "Name") + '</label><input type="text" id="cat-name" value="' + escapeAttr(currentName) + '" placeholder="' + (isRo ? "ex: Legume" : "e.g. Produce") + '"/></div>' +
          '<div class="group-header">' + (isRo ? "Icon" : "Icon") + '</div>' +
          '<div class="chip-grid" id="emoji-grid">' +
          FOOD_EMOJIS.map((e, i) => '<div class="chip emoji-chip' + (i === 0 ? " active" : "") + '" data-emoji="' + e + '">' + e + "</div>").join("") +
          "</div>" +
          '<div class="form-row"><label>' + (isRo ? "Personalizat" : "Custom") + '</label><input type="text" id="cat-custom-emoji" maxlength="4" placeholder="🙂"/></div>';
        const nameInput = content.querySelector("#cat-name");
        attachAutoCapitalize(nameInput, (val) => { currentName = val; });
        content.querySelectorAll(".emoji-chip").forEach((chip) => {
          chip.addEventListener("click", () => {
            content.querySelectorAll(".emoji-chip").forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            selectedEmoji = chip.dataset.emoji;
            content.querySelector("#cat-custom-emoji").value = "";
          });
        });
      }
    });
    return screen;
  }

  function openCategoryPicker(kind, currentId, onSelect) {
    const isRo = I18N.lang === "ro";
    const screen = pushScreen({
      title: isRo ? "Categorie" : "Category",
      left: { label: isRo ? "Închide" : "Close" },
      async render(content) {
        const cats = await getCategoriesSorted(kind);
        content.innerHTML =
          '<div class="add-row" id="add-cat-row">+ ' + (isRo ? "Categorie nouă" : "New Category") + "</div>" +
          '<div class="list-card">' +
          cats.map((c) =>
            '<div class="list-row tappable" data-cat-id="' + c.id + '">' +
            '<span>' + c.icon + "</span><span class=\"row-title\">" + c.name + "</span>" +
            (c.id === currentId ? '<span>✓</span>' : "") +
            "</div>"
          ).join("") +
          "</div>";
        content.querySelector("#add-cat-row").addEventListener("click", () => {
          openNewCategoryScreen(kind, (cat) => { onSelect(cat); screen.close(); });
        });
        content.querySelectorAll("[data-cat-id]").forEach((row) => {
          row.addEventListener("click", async () => {
            const cats2 = await getCategoriesSorted(kind);
            const cat = cats2.find((c) => c.id === row.dataset.catId);
            onSelect(cat);
            screen.close();
          });
        });
      }
    });
    return screen;
  }
  window.openCategoryPicker = openCategoryPicker;

  /* =========================================================
     Image compression helper
     ========================================================= */
  function compressImageFile(file, maxDim, quality) {
    maxDim = maxDim || 1024;
    quality = quality || 0.8;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
          else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* =========================================================
     Common measurement units
     ========================================================= */
  const COMMON_UNITS = ["kg", "g", "l", "ml", "buc", "lingură", "linguriță", "pachet", "fir", "felie"];

  /* =========================================================
     Ingredients
     ========================================================= */
  async function openIngredientEditor(ingredientId, onSaved, prefillName) {
    const isRo = I18N.lang === "ro";
    const isNew = !ingredientId;
    let ingredient = isNew
      ? { id: uuid(), categoryId: null, name: prefillName || "", note: "", units: [], excludeFromShoppingList: false, usageCount: 0 }
      : await DB.get("ingredients", ingredientId);
    let selectedCategory = ingredient.categoryId ? await DB.get("ingredientCategories", ingredient.categoryId) : null;

    const screen = pushScreen({
      title: isNew ? (isRo ? "Produs nou" : "New Product") : (isRo ? "Editează produs" : "Edit Product"),
      left: { label: isRo ? "Anulează" : "Cancel" },
      right: {
        label: isRo ? "Salvează" : "Save",
        action: async (close) => {
          const nameInput = screen.element.querySelector("#ing-name");
          const noteInput = screen.element.querySelector("#ing-note");
          const excludeInput = screen.element.querySelector("#ing-exclude");
          const name = nameInput.value.trim();
          if (!name) { nameInput.focus(); return; }
          ingredient.name = name;
          ingredient.note = noteInput.value.trim();
          ingredient.excludeFromShoppingList = excludeInput.checked;
          ingredient.categoryId = selectedCategory ? selectedCategory.id : null;
          ingredient.updatedAt = nowISO();
          if (ingredient.usageCount == null) ingredient.usageCount = 0;
          await DB.put("ingredients", ingredient);
          close();
          onSaved && onSaved();
        }
      },
      render(content, refresh) {
        content.innerHTML =
          '<div class="form-row"><label>' + (isRo ? "Nume" : "Name") + '</label><input type="text" id="ing-name" value="' + escapeAttr(ingredient.name) + '"/></div>' +
          '<div class="form-row tappable" id="ing-cat-row"><label>' + (isRo ? "Categorie" : "Category") + '</label><span style="flex:1">' + (selectedCategory ? selectedCategory.icon + " " + selectedCategory.name : (isRo ? "Fără categorie" : "None")) + '</span><span class="chevron">›</span></div>' +
          '<div class="form-row"><label>' + (isRo ? "Notă" : "Note") + '</label><input type="text" id="ing-note" value="' + escapeAttr(ingredient.note || "") + '"/></div>' +
          '<div class="form-row"><label style="width:auto;flex:1">' + (isRo ? "Exclude din lista de cumpărături" : "Exclude from shopping list") + '</label><input type="checkbox" id="ing-exclude" ' + (ingredient.excludeFromShoppingList ? "checked" : "") + "/></div>" +
          '<div class="group-header">' + (isRo ? "Unități" : "Units") + "</div>" +
          '<div class="list-card" id="ing-units-list">' +
          (ingredient.units || []).map((u, idx) =>
            '<div class="list-row" data-unit-idx="' + idx + '"><span class="row-title">' + u.unit + " — " + (isRo ? "implicit" : "default") + " " + u.defaultQty + '</span><span class="danger-remove-unit" style="color:var(--danger);cursor:pointer;">✕</span></div>'
          ).join("") +
          "</div>" +
          '<div class="add-row" id="add-unit-row">+ ' + (isRo ? "Adaugă unitate" : "Add unit") + "</div>" +
          (isNew ? "" : '<div class="danger-row" id="delete-ing-row">' + (isRo ? "Șterge produs" : "Delete Product") + "</div>");

        attachAutoCapitalize(content.querySelector("#ing-name"), (val) => { ingredient.name = val; });
        content.querySelector("#ing-note").addEventListener("input", (e) => { ingredient.note = e.target.value; });
        content.querySelector("#ing-exclude").addEventListener("change", (e) => { ingredient.excludeFromShoppingList = e.target.checked; });

        content.querySelector("#ing-cat-row").addEventListener("click", () => {
          openCategoryPicker("ingredient", selectedCategory ? selectedCategory.id : null, (cat) => {
            selectedCategory = cat;
            refresh();
          });
        });

        content.querySelectorAll(".danger-remove-unit").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const idx = parseInt(e.target.closest("[data-unit-idx]").dataset.unitIdx, 10);
            ingredient.units.splice(idx, 1);
            refresh();
          });
        });

        content.querySelector("#add-unit-row").addEventListener("click", () => {
          const unit = prompt(isRo ? "Nume unitate (ex: kg, buc)" : "Unit name (e.g. kg, pcs)", COMMON_UNITS[0]);
          if (!unit) return;
          const qtyStr = prompt(isRo ? "Cantitate implicită" : "Default quantity", "1");
          const qty = parseFloat(qtyStr);
          if (!qtyStr || isNaN(qty)) return;
          ingredient.units = ingredient.units || [];
          ingredient.units.push({ unit: unit.trim(), defaultQty: qty });
          refresh();
        });

        const deleteRow = content.querySelector("#delete-ing-row");
        if (deleteRow) {
          deleteRow.addEventListener("click", async () => {
            if (!confirm(isRo ? "Ștergi acest ingredient?" : "Delete this ingredient?")) return;
            await DB.delete("ingredients", ingredient.id);
            screen.close();
            onSaved && onSaved();
          });
        }
      }
    });
  }
  window.openIngredientEditor = openIngredientEditor;

  function escapeAttr(str) {
    return (str || "").replace(/"/g, "&quot;");
  }
  function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  window.escapeAttr = escapeAttr;
  window.escapeHtml = escapeHtml;
  function capitalizeFirstLetter(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function attachAutoCapitalize(inputEl, onChange) {
    inputEl.addEventListener("input", () => {
      const val = inputEl.value;
      const capped = capitalizeFirstLetter(val);
      if (capped !== val) {
        const pos = inputEl.selectionStart;
        inputEl.value = capped;
        inputEl.setSelectionRange(pos, pos);
      }
      onChange && onChange(inputEl.value);
    });
  }
  window.capitalizeFirstLetter = capitalizeFirstLetter;
  window.attachAutoCapitalize = attachAutoCapitalize;

  async function renderIngredientsScreen() {
    const listEl = document.getElementById("ingredients-list");
    const searchInput = document.getElementById("ingredients-search");
    if (!listEl) return;

    async function draw() {
      const filter = (searchInput.value || "").toLowerCase();
      const [ingredients, categories] = await Promise.all([
        DB.getAll("ingredients"),
        getCategoriesSorted("ingredient")
      ]);
      const filtered = ingredients.filter((i) => i.name.toLowerCase().includes(filter));
      const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
      const groups = new Map();
      const noCategory = [];
      filtered.forEach((ing) => {
        if (ing.categoryId && catById[ing.categoryId]) {
          if (!groups.has(ing.categoryId)) groups.set(ing.categoryId, []);
          groups.get(ing.categoryId).push(ing);
        } else {
          noCategory.push(ing);
        }
      });

      listEl.innerHTML = "";
      categories.forEach((cat) => {
        const items = groups.get(cat.id);
        if (!items || !items.length) return;
        listEl.appendChild(buildGroup(cat.icon + " " + cat.name, items));
      });
      if (noCategory.length) {
        listEl.appendChild(buildGroup(I18N.lang === "ro" ? "Fără categorie" : "No Category", noCategory));
      }

      function buildGroup(title, items) {
        const wrap = document.createElement("div");
        const header = document.createElement("div");
        header.className = "group-header";
        header.textContent = title;
        wrap.appendChild(header);
        const card = document.createElement("div");
        card.className = "list-card";
        items.sort((a, b) => a.name.localeCompare(b.name)).forEach((ing) => {
          const row = document.createElement("div");
          row.className = "list-row tappable";
          const unitsLabel = (ing.units && ing.units.length)
            ? ing.units.map((u) => u.defaultQty + " " + escapeHtml(u.unit)).join(", ")
            : "";
          row.innerHTML = '<span class="row-title">' + escapeHtml(ing.name) + "</span>" + (unitsLabel ? '<span class="rating-badge">' + unitsLabel + "</span>" : "");
          row.addEventListener("click", () => openIngredientEditor(ing.id, draw));
          card.appendChild(row);
          makeSwipeable(row, async () => {
            await DB.delete("ingredients", ing.id);
            draw();
          });
        });
        wrap.appendChild(card);
        return wrap;
      }
    }

    searchInput.oninput = draw;
    await draw();
  }
  window.renderIngredientsScreen = renderIngredientsScreen;

  /* =========================================================
     Shopping List (ad-hoc, Shopping tab)
     ========================================================= */
  async function renderShoppingScreen() {
    const listEl = document.getElementById("shopping-list");
    const searchInput = document.getElementById("shopping-search");
    if (!listEl) return;
    const isRo = I18N.lang === "ro";

    async function draw() {
      const filter = (searchInput.value || "").toLowerCase();
      const all = await DB.getAll("shoppingList");
      const items = all.filter((it) => it.source === "adhoc" && it.name.toLowerCase().includes(filter));
      items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

      listEl.innerHTML = "";
      const card = document.createElement("div");
      card.className = "list-card";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "list-row";
        const qtyLabel = (item.quantity != null && item.unit) ? (item.quantity + " " + escapeHtml(item.unit)) : "";
        row.innerHTML =
          '<span class="checkbox-circle' + (item.checked ? " checked" : "") + '" data-check-id="' + item.id + '">' + (item.checked ? "✓" : "") + "</span>" +
          '<span class="row-title' + (item.checked ? " strikethrough" : "") + '">' + escapeHtml(item.name) + "</span>" +
          (qtyLabel ? '<span class="rating-badge">' + qtyLabel + "</span>" : "");
        row.querySelector("[data-check-id]").addEventListener("click", async () => {
          item.checked = !item.checked;
          await DB.put("shoppingList", item);
          draw();
        });
        card.appendChild(row);
        makeSwipeable(row, async () => {
          await DB.delete("shoppingList", item.id);
          draw();
        });
      });
      listEl.appendChild(card);
      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "placeholder";
        empty.textContent = isRo ? "Lista de cumpărături e goală" : "Shopping list is empty";
        listEl.appendChild(empty);
      }
    }

    searchInput.oninput = draw;
    await draw();
  }
  window.renderShoppingScreen = renderShoppingScreen;

  function addAdhocShoppingItem(onAdded) {
    const isRo = I18N.lang === "ro";
    const name = prompt(isRo ? "Nume articol" : "Item name");
    if (!name || !name.trim()) return;
    const qtyStr = prompt(isRo ? "Cantitate (opțional)" : "Quantity (optional)", "");
    const unit = qtyStr ? prompt(isRo ? "Unitate (opțional)" : "Unit (optional)", "") : "";
    const item = {
      id: uuid(),
      source: "adhoc",
      name: capitalizeFirstLetter(name.trim()),
      quantity: qtyStr ? parseFloat(qtyStr) : null,
      unit: unit ? unit.trim() : "",
      checked: false,
      createdAt: nowISO()
    };
    DB.put("shoppingList", item).then(() => onAdded && onAdded());
  }
  window.addAdhocShoppingItem = addAdhocShoppingItem;

})();

  (function () {
    "use strict";

    /* =========================================================
       Ingredient picker (used when adding ingredients to a recipe)
       ========================================================= */
    function openIngredientPicker(existingIds, onAdd) {
    const isRo = I18N.lang === "ro";
    let addNewHandler = null;
    const screen = pushScreen({
      title: isRo ? "Caută produs" : "Search Product",
      left: { label: isRo ? "Terminat" : "Done" },
      right: {
        label: "+ " + (isRo ? "Adaugă" : "Add"),
        action: () => { addNewHandler && addNewHandler(); }
      },
      async render(content, refresh) {
        const all = await DB.getAll("ingredients");
        all.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

        content.innerHTML =
          '<div class="search-bar-wrap"><input type="text" id="picker-search" class="search-input" placeholder="' + (isRo ? "Caută..." : "Search...") + '"/></div>' +
          '<div class="group-header">' + (isRo ? "Rezultate" : "Search results") + '</div>' +
          '<div class="list-card" id="picker-results"></div>';

        const rightBtn = screen.element.querySelector('[data-nav="right"]');
        rightBtn.style.display = "none";
        const searchInput = content.querySelector("#picker-search");
        const resultsEl = content.querySelector("#picker-results");
        let expandedId = null;

        function drawResults() {
          const filter = (searchInput.value || "").toLowerCase();
          const filtered = all.filter((i) => i.name.toLowerCase().includes(filter));
          rightBtn.style.display = (filter && filtered.length === 0) ? "inline-flex" : "none";
          resultsEl.innerHTML = filtered.map((ing) => {
            const added = existingIds.has(ing.id);
            const isExpanded = expandedId === ing.id;
            let extra = "";
            if (isExpanded) {
              const units = (ing.units && ing.units.length) ? ing.units : [{ unit: COMMON_UNITS[0], defaultQty: 1 }];
              const defaultUnit = units[0];
              extra =
                '<div class="form-row extra-field-row"><label>' + (isRo ? "Cantitate" : "Quantity") + '</label>' +
                '<input type="number" id="qty-input" value="' + defaultUnit.defaultQty + '" step="any"/>' +
                '<select id="unit-select">' +
                units.map((u) => '<option value="' + escapeAttr(u.unit) + '">' + u.unit + "</option>").join("") +
                COMMON_UNITS.filter((cu) => !units.some((u) => u.unit === cu)).map((cu) => '<option value="' + cu + '">' + cu + "</option>").join("") +
                "</select></div>";
            }
            return '<div class="picker-row-wrap" data-ing-id="' + ing.id + '">' +
              '<div class="list-row tappable"><span>' + (added ? "✅" : "⬜️") + '</span><span class="row-title' + (added ? '" style="text-decoration:line-through;color:var(--text-secondary)' : '') + '">' + escapeHtml(ing.name) + "</span></div>" +
              extra +
              "</div>";
          }).join("");

          resultsEl.querySelectorAll(".picker-row-wrap").forEach((wrap) => {
            const id = wrap.dataset.ingId;
            const ing = all.find((i) => i.id === id);
            const mainRow = wrap.querySelector(".list-row");
            mainRow.addEventListener("click", () => {
              if (existingIds.has(id)) return; // already added, ignore
              if (expandedId !== id) {
                expandedId = id;
                drawResults();
                return;
              }
              // second tap -> confirm add with current/default values
              confirmAdd(ing);
            });
            const qtyInput = wrap.querySelector("#qty-input");
            const unitSelect = wrap.querySelector("#unit-select");
            if (qtyInput && unitSelect) {
              [qtyInput, unitSelect].forEach((el) => {
                el.addEventListener("click", (e) => e.stopPropagation());
              });
              qtyInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { confirmAdd(ing, qtyInput.value, unitSelect.value); }
              });
            }
          });
        }

        async function confirmAdd(ing, qtyOverride, unitOverride) {
          if (existingIds.has(ing.id)) return; // safety guard, don't add twice
          const wrap = resultsEl.querySelector('[data-ing-id="' + ing.id + '"]');
          const qtyInput = wrap.querySelector("#qty-input");
          const unitSelect = wrap.querySelector("#unit-select");
          const qty = parseFloat(qtyOverride !== undefined ? qtyOverride : (qtyInput ? qtyInput.value : 1)) || 1;
          const unit = unitOverride !== undefined ? unitOverride : (unitSelect ? unitSelect.value : (ing.units[0] ? ing.units[0].unit : COMMON_UNITS[0]));

          // auto-learn new unit for this ingredient
          ing.units = ing.units || [];
          if (!ing.units.some((u) => u.unit === unit)) {
            ing.units.push({ unit, defaultQty: qty });
          }
          ing.usageCount = (ing.usageCount || 0) + 1;
          ing.updatedAt = nowISO();
          await DB.put("ingredients", ing);

          existingIds.add(ing.id);
          onAdd({ ingredientId: ing.id, name: ing.name, unit, quantity: qty });
          expandedId = null;
          searchInput.value = "";
          searchInput.focus();
          drawResults();
        }

        searchInput.addEventListener("input", drawResults);
        addNewHandler = () => {
          const prefillName = capitalizeFirstLetter(searchInput.value.trim());
          openIngredientEditor(null, async () => {
            const refreshed = await DB.getAll("ingredients");
            all.length = 0;
            all.push(...refreshed);
            all.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
            drawResults();
          }, prefillName);
        };

        drawResults();
        searchInput.select();
      }
    });
    return screen;
  }
  window.openIngredientPicker = openIngredientPicker;

  /* =========================================================
     Recipes
     ========================================================= */
  const TOGGLE_DEFS = [
    { key: "wash", emoji: "🧼", en: "Wash", ro: "Spălare" },
    { key: "peel", emoji: "🥔", en: "Peel", ro: "Curățare" },
    { key: "cut", emoji: "🔪", en: "Cut", ro: "Tăiere" },
    { key: "mix", emoji: "🥣", en: "Mix", ro: "Amestecare" },
    { key: "blend", emoji: "🌀", en: "Blend", ro: "Blender" },
    { key: "decorate", emoji: "🎂", en: "Decorate", ro: "Decorare" },
    { key: "boil", emoji: "♨️", en: "Boil", ro: "Fierbere" },
    { key: "oven", emoji: "🔥", en: "Oven", ro: "Cuptor" },
    { key: "waiting", emoji: "🌙", en: "Waiting", ro: "Așteptare" }
  ];
  window.TOGGLE_DEFS = TOGGLE_DEFS;

  function avgRating(ratings) {
    const vals = Object.values(ratings || {}).filter((v) => v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  async function openRatingPopup(recipe, onSaved) {
    const isRo = I18N.lang === "ro";
    const members = await DB.getAll("familyMembers");
    const ratings = Object.assign({}, recipe.ratings || {});
    const screen = pushScreen({
      title: isRo ? "Evaluare" : "Rating",
      left: { label: isRo ? "Închide" : "Close" },
      right: {
        label: isRo ? "Salvează" : "Save",
        action: async (close) => {
          recipe.ratings = ratings;
          recipe.updatedAt = nowISO();
          await DB.put("recipes", recipe);
          close();
          onSaved && onSaved();
        }
      },
      render(content, refresh) {
        content.innerHTML = members.map((m) => {
          const score = ratings[m.id] || 0;
          let stars = "";
          for (let i = 1; i <= 5; i++) {
            stars += '<span class="star' + (i <= score ? " filled" : "") + '" data-member="' + m.id + '" data-score="' + i + '">★</span>';
          }
          return '<div class="star-row"><span class="member-name">' + escapeHtml(m.name) + '</span><span class="stars">' + stars + "</span></div>";
        }).join("");
        content.querySelectorAll(".star").forEach((star) => {
          star.addEventListener("click", () => {
            ratings[star.dataset.member] = parseInt(star.dataset.score, 10);
            refresh();
          });
        });
      }
    });
  }

  /* =========================================================
     Recipe-ingredient usage editor (quantity/unit/note for this recipe)
     ========================================================= */
  function openRecipeIngredientEditor(ri, onSaved) {
    const isRo = I18N.lang === "ro";
    const screen = pushScreen({
      title: ri.name,
      left: { label: isRo ? "Anulează" : "Cancel" },
      right: {
        label: isRo ? "Salvează" : "Save",
        action: (close) => {
          const qtyInput = screen.element.querySelector("#ri-qty");
          const unitInput = screen.element.querySelector("#ri-unit");
          const noteInput = screen.element.querySelector("#ri-note");
          const qty = parseFloat(qtyInput.value);
          ri.quantity = isNaN(qty) ? ri.quantity : qty;
          ri.unit = unitInput.value.trim() || ri.unit;
          ri.note = noteInput.value.trim();
          close();
          onSaved && onSaved();
        }
      },
      render(content) {
        content.innerHTML =
          '<div class="form-row"><label>' + (isRo ? "Cantitate" : "Quantity") + '</label><input type="number" id="ri-qty" value="' + ri.quantity + '" step="any"/></div>' +
          '<div class="form-row"><label>' + (isRo ? "Unitate" : "Unit") + '</label><input type="text" id="ri-unit" value="' + escapeAttr(ri.unit) + '"/></div>' +
          '<div class="form-row"><label>' + (isRo ? "Notă" : "Note") + '</label><input type="text" id="ri-note" value="' + escapeAttr(ri.note || "") + '"/></div>';
      }
    });
    return screen;
  }
  window.openRecipeIngredientEditor = openRecipeIngredientEditor;

  async function openRecipeEditor(recipeId, onSaved, prefillName) {
    const isRo = I18N.lang === "ro";
    const isNew = !recipeId;
    let recipe = isNew
      ? { id: uuid(), categoryId: null, name: prefillName || "", toggles: {}, boilTime: 20, ovenTemp: 180, ovenTime: 60, waitingHours: 8, ingredients: [], preparationText: "", preparationPhoto: null, sourceUrl: "", totalDuration: null, ratings: {}, photo: null }
      : await DB.get("recipes", recipeId);
    let selectedCategory = recipe.categoryId ? await DB.get("recipeCategories", recipe.categoryId) : null;

    const screen = pushScreen({
      title: isNew ? (isRo ? "Rețetă nouă" : "New Recipe") : (isRo ? "Editează rețeta" : "Edit Recipe"),
      left: { label: isRo ? "Anulează" : "Cancel" },
      right: {
        label: isRo ? "Salvează" : "Save",
        action: async (close) => {
          const nameInput = screen.element.querySelector("#rec-name");
          const name = nameInput.value.trim();
          if (!name) { nameInput.focus(); return; }
          recipe.name = name;
          recipe.categoryId = selectedCategory ? selectedCategory.id : null;
          recipe.preparationText = screen.element.querySelector("#rec-prep").value;
          recipe.sourceUrl = screen.element.querySelector("#rec-source").value.trim();
          const durVal = screen.element.querySelector("#rec-duration").value;
          recipe.totalDuration = durVal ? parseFloat(durVal) : null;
          recipe.updatedAt = nowISO();
          await DB.put("recipes", recipe);
          close();
          onSaved && onSaved();
        }
      },
      render(content, refresh) {
        const avg = avgRating(recipe.ratings);
        content.innerHTML =
          '<div class="form-row"><label>' + (isRo ? "Nume" : "Name") + '</label><input type="text" id="rec-name" value="' + escapeAttr(recipe.name) + '"/>' +
          (avg ? '<span class="rating-badge" id="rec-avg-badge">⭐ ' + avg.toFixed(1) + "</span>" : "") + "</div>" +
          '<div class="form-row tappable" id="rec-cat-row"><label>' + (isRo ? "Categorie" : "Category") + '</label><span style="flex:1">' + (selectedCategory ? selectedCategory.icon + " " + selectedCategory.name : (isRo ? "Fără categorie" : "None")) + '</span><span class="chevron">›</span></div>' +
          '<div class="form-row tappable" id="rec-rate-row"><label>' + (isRo ? "Evaluare" : "Rating") + '</label><span style="flex:1">' + (avg ? avg.toFixed(1) + " ★" : (isRo ? "Neevaluat" : "Not rated")) + '</span><span class="chevron">›</span></div>' +

          '<div class="group-header">' + (isRo ? "Pași de preparare" : "Preparation steps") + '</div>' +
          '<div class="chip-grid" id="toggle-grid">' +
          TOGGLE_DEFS.map((t) => '<div class="chip' + (recipe.toggles[t.key] ? " active" : "") + '" data-toggle="' + t.key + '">' + t.emoji + " " + (isRo ? t.ro : t.en) + "</div>").join("") +
          "</div>" +
          (recipe.toggles.boil ? '<div class="form-row extra-field-row"><label>' + (isRo ? "Timp fierbere (min)" : "Boil time (min)") + '</label><input type="number" id="rec-boil-time" value="' + (recipe.boilTime ?? 20) + '"/></div>' : "") +
          (recipe.toggles.oven ? '<div class="form-row extra-field-row"><label>' + (isRo ? "Temp. cuptor (°C)" : "Oven temp (°C)") + '</label><input type="number" id="rec-oven-temp" value="' + (recipe.ovenTemp ?? 180) + '"/></div>' +
            '<div class="form-row extra-field-row"><label>' + (isRo ? "Timp cuptor (min)" : "Oven time (min)") + '</label><input type="number" id="rec-oven-time" value="' + (recipe.ovenTime ?? 60) + '"/></div>' : "") +
          (recipe.toggles.waiting ? '<div class="form-row extra-field-row"><label>' + (isRo ? "Ore așteptare" : "Waiting hours") + '</label><input type="number" id="rec-waiting-hours" value="' + (recipe.waitingHours ?? 8) + '"/></div>' : "") +

          '<div class="group-header" style="justify-content:space-between;"><span>' + (isRo ? "Ingrediente" : "Ingredients") + '</span><span id="add-ing-row" style="color:var(--accent);font-size:20px;cursor:pointer;">+</span></div>' +
          '<div class="list-card" id="rec-ingredients-list">' +
          recipe.ingredients.map((ri, idx) =>
            '<div class="list-row tappable" data-ing-row-idx="' + idx + '"><span class="row-title">' + escapeHtml(ri.name) + (ri.note ? ' <span style="color:var(--text-secondary);font-size:13px;">(' + escapeHtml(ri.note) + ')</span>' : "") + '</span><span class="rating-badge">' + ri.quantity + " " + escapeHtml(ri.unit) + "</span></div>"
          ).join("") +
          "</div>" +

          '<div class="group-header">' + (isRo ? "Preparare" : "Preparation") + '</div>' +
          '<div class="form-row"><textarea id="rec-prep" placeholder="' + (isRo ? "Descriere preparare..." : "Preparation text...") + '">' + escapeHtml(recipe.preparationText || "") + "</textarea></div>" +
          (recipe.preparationPhoto ? '<img class="photo-preview" src="' + recipe.preparationPhoto + '"/>' : "") +
          '<div class="add-row" id="add-prep-photo-row">' + (recipe.preparationPhoto ? (isRo ? "Înlocuiește poza" : "Replace photo") : "+ " + (isRo ? "Adaugă poză" : "Add photo")) + "</div>" +
          '<input type="file" accept="image/*" id="prep-photo-input" style="display:none"/>' +

          '<div class="form-row"><label>' + (isRo ? "Sursă (link)" : "Source URL") + '</label><input type="url" id="rec-source" value="' + escapeAttr(recipe.sourceUrl || "") + '"/></div>' +
          '<div class="form-row"><label>' + (isRo ? "Durată totală (min)" : "Total duration (min)") + '</label><input type="number" id="rec-duration" value="' + (recipe.totalDuration ?? "") + '"/></div>' +

          '<div class="group-header">' + (isRo ? "Poză rețetă" : "Recipe photo") + "</div>" +
          (recipe.photo ? '<img class="photo-preview" src="' + recipe.photo + '"/>' : "") +
          '<div class="add-row" id="add-recipe-photo-row">' + (recipe.photo ? (isRo ? "Înlocuiește poza" : "Replace photo") : "+ " + (isRo ? "Adaugă poză" : "Add photo")) + "</div>" +
          '<input type="file" accept="image/*" id="recipe-photo-input" style="display:none"/>' +

          (isNew ? "" : '<div class="danger-row" id="delete-rec-row">' + (isRo ? "Șterge rețeta" : "Delete Recipe") + "</div>");

        attachAutoCapitalize(content.querySelector("#rec-name"), (val) => { recipe.name = val; });
        content.querySelector("#rec-prep").addEventListener("input", (e) => { recipe.preparationText = e.target.value; });
        content.querySelector("#rec-source").addEventListener("input", (e) => { recipe.sourceUrl = e.target.value; });
        content.querySelector("#rec-duration").addEventListener("input", (e) => { recipe.totalDuration = e.target.value ? parseFloat(e.target.value) : null; });

        content.querySelector("#rec-cat-row").addEventListener("click", () => {
          openCategoryPicker("recipe", selectedCategory ? selectedCategory.id : null, (cat) => {
            selectedCategory = cat;
            refresh();
          });
        });

        content.querySelector("#rec-rate-row").addEventListener("click", () => {
          openRatingPopup(recipe, () => refresh());
        });

        content.querySelectorAll("[data-toggle]").forEach((chip) => {
          chip.addEventListener("click", () => {
            const key = chip.dataset.toggle;
            recipe.toggles[key] = !recipe.toggles[key];
            refresh();
          });
        });

        content.querySelector("#add-ing-row").addEventListener("click", () => {
          const existingIds = new Set(recipe.ingredients.map((i) => i.ingredientId));
          openIngredientPicker(existingIds, (item) => {
            recipe.ingredients.push(item);
            refresh();
          });
        });

        content.querySelectorAll("[data-ing-row-idx]").forEach((row) => {
          row.addEventListener("click", () => {
            const idx = parseInt(row.dataset.ingRowIdx, 10);
            openRecipeIngredientEditor(recipe.ingredients[idx], () => {
              refresh();
            });
          });
          makeSwipeable(row, () => {
            const idx = parseInt(row.dataset.ingRowIdx, 10);
            recipe.ingredients.splice(idx, 1);
            refresh();
          });
        });

        function wirePhotoRow(rowId, inputId, field) {
          const row = content.querySelector(rowId);
          const input = content.querySelector(inputId);
          row.addEventListener("click", () => input.click());
          input.addEventListener("change", async () => {
            if (!input.files || !input.files[0]) return;
            recipe[field] = await compressImageFile(input.files[0]);
            refresh();
          });
        }
        wirePhotoRow("#add-prep-photo-row", "#prep-photo-input", "preparationPhoto");
        wirePhotoRow("#add-recipe-photo-row", "#recipe-photo-input", "photo");

        const deleteRow = content.querySelector("#delete-rec-row");
        if (deleteRow) {
          deleteRow.addEventListener("click", async () => {
            if (!confirm(isRo ? "Ștergi această rețetă?" : "Delete this recipe?")) return;
            await DB.delete("recipes", recipe.id);
            screen.close();
            onSaved && onSaved();
          });
        }

        // preserve boil/oven/waiting extra field edits when toggling other chips
        ["rec-boil-time", "rec-oven-temp", "rec-oven-time", "rec-waiting-hours"].forEach((id) => {
          const el = content.querySelector("#" + id);
          if (!el) return;
          el.addEventListener("input", () => {
            if (id === "rec-boil-time") recipe.boilTime = parseFloat(el.value) || 0;
            if (id === "rec-oven-temp") recipe.ovenTemp = parseFloat(el.value) || 0;
            if (id === "rec-oven-time") recipe.ovenTime = parseFloat(el.value) || 0;
            if (id === "rec-waiting-hours") recipe.waitingHours = parseFloat(el.value) || 0;
          });
        });
      }
    });
  }
  window.openRecipeEditor = openRecipeEditor;

  async function renderRecipesScreen() {
    const listEl = document.getElementById("recipes-list");
    const searchInput = document.getElementById("recipes-search");
    if (!listEl) return;

    async function draw() {
      const filter = (searchInput.value || "").toLowerCase();
      const [recipes, categories] = await Promise.all([
        DB.getAll("recipes"),
        getCategoriesSorted("recipe")
      ]);
      const filtered = recipes.filter((r) => r.name.toLowerCase().includes(filter));
      const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
      const groups = new Map();
      const noCategory = [];
      filtered.forEach((r) => {
        if (r.categoryId && catById[r.categoryId]) {
          if (!groups.has(r.categoryId)) groups.set(r.categoryId, []);
          groups.get(r.categoryId).push(r);
        } else {
          noCategory.push(r);
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
        items.sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => {
          const avg = avgRating(r.ratings);
          const row = document.createElement("div");
          row.className = "list-row tappable";
          row.innerHTML = '<span class="row-title">' + escapeHtml(r.name) + "</span>" + (avg ? '<span class="rating-badge">⭐ ' + avg.toFixed(1) + "</span>" : "");
          row.addEventListener("click", () => openRecipeEditor(r.id, draw));
          card.appendChild(row);
          makeSwipeable(row, async () => {
            await DB.delete("recipes", r.id);
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
  window.renderRecipesScreen = renderRecipesScreen;

})();

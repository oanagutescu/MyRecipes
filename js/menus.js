(function () {
  "use strict";

  /* =========================================================
     Menus
     ========================================================= */
  function formatMenuDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(I18N.lang === "ro" ? "ro-RO" : "en-US", { month: "short", day: "numeric" });
  }

  function defaultMenuName(dateStr) {
    return (I18N.lang === "ro" ? "Meniu — " : "Menu — ") + formatMenuDate(dateStr);
  }

  function computeMethodIcons(recipe) {
    const icons = [];
    if (!recipe) return icons;
    const t = recipe.toggles || {};
    if (t.oven) icons.push({ emoji: "🔥", text: (recipe.ovenTemp ?? 180) + "°C " + (recipe.ovenTime ?? 60) + "m" });
    if (t.boil) icons.push({ emoji: "♨️", text: (recipe.boilTime ?? 20) + "m" });
    if (!t.oven && !t.boil) icons.push({ emoji: "❄️", text: "" });
    return icons;
  }

  function todayISODate() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  async function createAndOpenMenu(onListChanged) {
    const date = todayISODate();
    const menu = { id: uuid(), name: defaultMenuName(date), date, recipes: [], updatedAt: nowISO() };
    await DB.put("menus", menu);
    openMenuDetail(menu.id, onListChanged);
  }

  /* =========================================================
     Per-menu shopping list (aggregated from recipe ingredients,
     plus ad-hoc extra items, checked/excluded state persisted)
     ========================================================= */
  async function openMenuShoppingList(menu) {
    const isRo = I18N.lang === "ro";
    let addMenuAdhocItem = () => {};
    const screen = pushScreen({
      title: isRo ? "Listă cumpărături" : "Shopping List",
      left: { label: isRo ? "Terminat" : "Done" },
      right: {
        label: "+ " + (isRo ? "Adaugă" : "Add"),
        action: () => { addMenuAdhocItem(); }
      },
      async render(content, refresh) {
        const recipes = await Promise.all(menu.recipes.map((mr) => DB.get("recipes", mr.recipeId)));
        const allProducts = await DB.getAll("ingredients");
        const productById = Object.fromEntries(allProducts.map((p) => [p.id, p]));

        // Aggregate ingredient quantities across all recipes in this menu, merging by ingredientId+unit
        const aggregated = new Map();
        recipes.forEach((rec) => {
          if (!rec) return;
          (rec.ingredients || []).forEach((ri) => {
            const key = ri.ingredientId + "|" + ri.unit;
            if (!aggregated.has(key)) {
              aggregated.set(key, { ingredientId: ri.ingredientId, name: ri.name, unit: ri.unit, quantity: 0 });
            }
            aggregated.get(key).quantity += (ri.quantity || 0);
          });
        });

        // Persisted state (checked / included) for this menu's shopping items
        const stateId = "menu-" + menu.id;
        let state = await DB.get("shoppingList", stateId);
        if (!state) {
          state = { id: stateId, source: "menu", menuId: menu.id, items: {}, extras: [] };
        }
        state.items = state.items || {};
        state.extras = state.extras || [];

        async function saveState() {
          await DB.put("shoppingList", state);
        }

        const aggregatedList = Array.from(aggregated.values());
        // Include excluded-from-shopping-list products too, but unchecked/grayed and only if explicitly added or already have state
        aggregatedList.sort((a, b) => a.name.localeCompare(b.name));

        function rowHtml(item, idKey, excludedByDefault) {
          const itemState = state.items[idKey] || {};
          const checked = !!itemState.checked;
          const qtyLabel = item.unit ? (item.quantity + " " + escapeHtml(item.unit)) : (item.quantity || "");
          return '<div class="list-row" data-item-key="' + idKey + '">' +
            '<span class="checkbox-circle' + (checked ? " checked" : "") + '" data-check-key="' + idKey + '">' + (checked ? "✓" : "") + "</span>" +
            '<span class="row-title' + (checked ? " strikethrough" : "") + (excludedByDefault ? '" style="color:var(--text-secondary)' : '') + '">' + escapeHtml(item.name) + "</span>" +
            (qtyLabel ? '<span class="rating-badge">' + qtyLabel + "</span>" : "") +
            "</div>";
        }

        let html = "";
        const included = aggregatedList.filter((it) => {
          const product = productById[it.ingredientId];
          const excluded = product && product.excludeFromShoppingList;
          return !excluded || state.items[it.ingredientId + "|" + it.unit];
        });
        const excludedOnly = aggregatedList.filter((it) => {
          const product = productById[it.ingredientId];
          const excluded = product && product.excludeFromShoppingList;
          return excluded && !state.items[it.ingredientId + "|" + it.unit];
        });

        if (included.length) {
          html += '<div class="group-header">' + (isRo ? "Din rețete" : "From recipes") + '</div><div class="list-card">' +
            included.map((it) => rowHtml(it, it.ingredientId + "|" + it.unit, false)).join("") + "</div>";
        }
        if (state.extras.length) {
          html += '<div class="group-header">' + (isRo ? "Adăugate" : "Added") + '</div><div class="list-card">' +
            state.extras.map((ex, idx) => rowHtml(ex, "extra-" + idx, false)).join("") + "</div>";
        }
        if (excludedOnly.length) {
          html += '<div class="group-header">' + (isRo ? "Excluse (atinge pentru a adăuga)" : "Excluded (tap to add)") + '</div><div class="list-card">' +
            excludedOnly.map((it) => '<div class="list-row tappable" data-add-excluded-key="' + it.ingredientId + '|' + it.unit + '"><span class="row-title" style="color:var(--text-secondary)">' + escapeHtml(it.name) + '</span><span class="rating-badge">+</span></div>').join("") + "</div>";
        }
        if (!included.length && !state.extras.length && !excludedOnly.length) {
          html += '<div class="placeholder">' + (isRo ? "Lista de cumpărături e goală" : "Shopping list is empty") + "</div>";
        }
        content.innerHTML = html;

        content.querySelectorAll("[data-check-key]").forEach((el) => {
          el.addEventListener("click", async () => {
            const key = el.dataset.checkKey;
            state.items[key] = state.items[key] || {};
            state.items[key].checked = !state.items[key].checked;
            await saveState();
            refresh();
          });
        });
        content.querySelectorAll("[data-add-excluded-key]").forEach((el) => {
          el.addEventListener("click", async () => {
            const key = el.dataset.addExcludedKey;
            state.items[key] = state.items[key] || {};
            await saveState();
            refresh();
          });
        });

        addMenuAdhocItem = function () {
          const name = prompt(isRo ? "Nume articol" : "Item name");
          if (!name || !name.trim()) return;
          const qtyStr = prompt(isRo ? "Cantitate (opțional)" : "Quantity (optional)", "");
          const unit = qtyStr ? prompt(isRo ? "Unitate (opțional)" : "Unit (optional)", "") : "";
          state.extras.push({
            name: capitalizeFirstLetter(name.trim()),
            quantity: qtyStr ? parseFloat(qtyStr) : null,
            unit: unit ? unit.trim() : ""
          });
          saveState().then(refresh);
        };
      }
    });

    return screen;
  }
  window.openMenuShoppingList = openMenuShoppingList;

  function openRecipePickerForMenu(menu, onChange) {
    const isRo = I18N.lang === "ro";
    let addNewHandler = null;
    const screen = pushScreen({
      title: isRo ? "Caută rețetă" : "Search Recipe",
      left: { label: isRo ? "Terminat" : "Done" },
      right: {
        label: "+ " + (isRo ? "Adaugă" : "Add"),
        action: () => { addNewHandler && addNewHandler(); }
      },
      async render(content) {
        const [recipes, categories] = await Promise.all([DB.getAll("recipes"), getCategoriesSorted("recipe")]);
        const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

        content.innerHTML =
          '<div class="search-bar-wrap"><input type="text" id="rpicker-search" class="search-input" placeholder="' + (isRo ? "Caută..." : "Search...") + '"/></div>' +
          '<div id="rpicker-results"></div>';

        const rightBtn = screen.element.querySelector('[data-nav="right"]');
        rightBtn.style.display = "none";
        const searchInput = content.querySelector("#rpicker-search");
        const resultsEl = content.querySelector("#rpicker-results");

        function isInMenu(id) { return menu.recipes.some((r) => r.recipeId === id); }

        function drawResults() {
          const filter = (searchInput.value || "").toLowerCase();
          const filtered = recipes.filter((r) => r.name.toLowerCase().includes(filter));
          rightBtn.style.display = (filter && filtered.length === 0) ? "inline-flex" : "none";

          const groups = new Map();
          const noCat = [];
          filtered.forEach((r) => {
            if (r.categoryId && catById[r.categoryId]) {
              if (!groups.has(r.categoryId)) groups.set(r.categoryId, []);
              groups.get(r.categoryId).push(r);
            } else noCat.push(r);
          });

          let html = "";
          categories.forEach((cat) => {
            const items = groups.get(cat.id);
            if (!items || !items.length) return;
            html += '<div class="group-header">' + cat.icon + " " + escapeHtml(cat.name) + '</div><div class="list-card">' +
              items.map((r) => rowHtml(r)).join("") + "</div>";
          });
          if (noCat.length) {
            html += '<div class="group-header">' + (isRo ? "Fără categorie" : "No Category") + '</div><div class="list-card">' +
              noCat.map((r) => rowHtml(r)).join("") + "</div>";
          }
          resultsEl.innerHTML = html;

          function rowHtml(r) {
            const added = isInMenu(r.id);
            return '<div class="list-row tappable" data-recipe-id="' + r.id + '"><span>' + (added ? "✅" : "⬜️") +
              '</span><span class="row-title' + (added ? '" style="text-decoration:line-through;color:var(--text-secondary)' : '') + '">' +
              escapeHtml(r.name) + "</span></div>";
          }

          resultsEl.querySelectorAll("[data-recipe-id]").forEach((row) => {
            row.addEventListener("click", () => {
              const id = row.dataset.recipeId;
              const rec = recipes.find((x) => x.id === id);
              const idx = menu.recipes.findIndex((x) => x.recipeId === id);
              if (idx >= 0) {
                menu.recipes.splice(idx, 1);
              } else {
                menu.recipes.push({ recipeId: id, name: rec.name, checked: false });
              }
              menu.updatedAt = nowISO();
              DB.put("menus", menu);
              onChange();
              drawResults();
            });
          });
        }

        searchInput.addEventListener("input", drawResults);
        addNewHandler = () => {
          const prefillName = capitalizeFirstLetter(searchInput.value.trim());
          openRecipeEditor(null, async () => {
            const refreshed = await DB.getAll("recipes");
            recipes.length = 0;
            recipes.push(...refreshed);
            drawResults();
          }, prefillName);
        };

        drawResults();
      }
    });
    return screen;
  }

  /* =========================================================
     Cooking Mode
     ========================================================= */
  function formatSecondsAsTimer(totalSec) {
    const s = Math.max(0, Math.round(totalSec));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  function formatElapsed(totalSec) {
    const s = Math.max(0, Math.round(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0")
      : String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  function formatClockTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function currentElapsedSec(s) {
    if (!s.startedAt) return 0;
    const extra = s.running && s.lastResumeTs ? (Date.now() - s.lastResumeTs) / 1000 : 0;
    return s.elapsedSec + extra;
  }

  function playCookingAlarm() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      let t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, t);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
        t += 0.35;
      }
    } catch (err) {
      console.warn("Could not play cooking alarm sound:", err);
    }
  }

  function openCookingMode(menu, onDone) {
    const isRo = I18N.lang === "ro";
    // Per-recipe-in-memory state: { doneSteps: {toggleKey:bool}, timers: { boil:{remainingSec,running,intervalId,totalSec}, oven:{...} }, finished: bool }
    const state = new Map();

    const screen = pushScreen({
      title: isRo ? "Mod gătit" : "Cooking Mode",
      left: {
        label: isRo ? "Terminat" : "Done",
        action: (close) => {
          state.forEach((s) => {
            ["boil", "oven"].forEach((k) => {
              if (s.timers[k] && s.timers[k].intervalId) clearInterval(s.timers[k].intervalId);
            });
            if (s.elapsedIntervalId) clearInterval(s.elapsedIntervalId);
          });
          close();
          onDone && onDone();
        }
      },
      async render(content, refresh) {
        const recipesData = await Promise.all(menu.recipes.map((mr) => DB.get("recipes", mr.recipeId)));

        recipesData.forEach((rec, idx) => {
          if (!rec) return;
          if (!state.has(rec.id)) {
            state.set(rec.id, {
              doneSteps: {},
              timers: {
                boil: { remainingSec: (rec.boilTime || 20) * 60, totalSec: (rec.boilTime || 20) * 60, running: false, intervalId: null },
                oven: { remainingSec: (rec.ovenTime || 60) * 60, totalSec: (rec.ovenTime || 60) * 60, running: false, intervalId: null }
              },
              finished: !!menu.recipes[idx].checked,
              startedAt: null,
              sessionId: null,
              elapsedSec: 0,
              running: false,
              lastResumeTs: null,
              elapsedIntervalId: null,
              finalElapsedSec: null
            });
          }
        });

        const stepToggleKeys = ["wash", "peel", "cut", "mix", "blend", "decorate"];

        content.innerHTML = recipesData.map((rec, idx) => {
          if (!rec) return "";
          const s = state.get(rec.id);
          const toggles = rec.toggles || {};
          const stepsHtml = stepToggleKeys.filter((k) => toggles[k]).map((k) => {
            const def = TOGGLE_DEFS.find((t) => t.key === k);
            const checked = !!s.doneSteps[k];
            return '<div class="cooking-toggle-item' + (checked ? " checked" : "") + '" data-recipe-id="' + rec.id + '" data-step-key="' + k + '">' +
              '<span class="ct-check">' + (checked ? "✓" : "") + '</span>' +
              '<span class="ct-label">' + def.emoji + ' ' + (isRo ? def.ro : def.en) + '</span></div>';
          }).join("");

          let timersHtml = "";
          if (toggles.boil) timersHtml += cookingTimerRowHtml(rec.id, "boil", isRo ? "Fierbere" : "Boil", s.timers.boil);
          if (toggles.oven) {
            const ovenLabel = (isRo ? "Cuptor" : "Oven") + " (" + (rec.ovenTemp ?? 180) + "°C)";
            timersHtml += cookingTimerRowHtml(rec.id, "oven", ovenLabel, s.timers.oven);
          }
          if (toggles.waiting) {
            timersHtml += '<div class="cooking-timer-row"><span class="ct-timer-label">🌙 ' + (isRo ? "Așteptare" : "Waiting") + '</span>' +
              '<span class="cooking-timer-display">' + (rec.waitingHours ?? 8) + 'h</span></div>';
          }

          let elapsedRowHtml = "";
          if (s.finished && s.finalElapsedSec !== null) {
            elapsedRowHtml = '<div class="cooking-elapsed-row"><span class="ce-start">' + (isRo ? "Pornit la " : "Started at ") + formatClockTime(s.startedAt) + '</span>' +
              '<span class="ce-total">' + (isRo ? "Total: " : "Total: ") + formatElapsed(s.finalElapsedSec) + '</span></div>';
          } else if (s.startedAt) {
            elapsedRowHtml = '<div class="cooking-elapsed-row"><span class="ce-start">' + (isRo ? "Pornit la " : "Started at ") + formatClockTime(s.startedAt) + '</span>' +
              '<span class="ce-elapsed" data-elapsed-display="' + rec.id + '">' + formatElapsed(currentElapsedSec(s)) + '</span>' +
              '<button class="cooking-timer-btn secondary" data-elapsed-toggle="' + rec.id + '">' + (s.running ? (isRo ? "Pauză" : "Pause") : (isRo ? "Reia" : "Resume")) + '</button></div>';
          }

          return '<div class="cooking-recipe-card' + (s.finished ? " done" : "") + '" data-card-recipe-id="' + rec.id + '">' +
            '<div class="cooking-recipe-header"><span class="cr-name">' + escapeHtml(rec.name) + '</span>' +
            '<button class="cr-start-btn" data-start-id="' + rec.id + '"' + (s.startedAt || s.finished ? " disabled" : "") + '>' + (s.startedAt ? (isRo ? "Pornit ⏱" : "Started ⏱") : (isRo ? "Start" : "Start")) + '</button>' +
            '<button class="cr-done-btn" data-finish-id="' + rec.id + '">' + (s.finished ? (isRo ? "Făcut ✓" : "Done ✓") : (isRo ? "Termină" : "Finish")) + '</button></div>' +
            elapsedRowHtml +
            (stepsHtml ? '<div class="cooking-toggle-list">' + stepsHtml + '</div>' : "") +
            timersHtml +
            '<div class="cooking-link-row"><span data-view-steps-id="' + rec.id + '">📋 ' + (isRo ? "Pași" : "Steps") + '</span>' +
            '<span data-view-ing-id="' + rec.id + '">🥕 ' + (isRo ? "Ingrediente" : "Ingredients") + '</span></div>' +
            '</div>';
        }).join("") || ('<div class="placeholder">' + (isRo ? "Niciun fel de mâncare în acest meniu" : "No recipes in this menu") + '</div>');

        function cookingTimerRowHtml(recipeId, key, label, timer) {
          const emoji = key === "boil" ? "♨️" : "🔥";
          return '<div class="cooking-timer-row">' +
            '<span class="ct-timer-label">' + emoji + ' ' + label + '</span>' +
            '<div class="cooking-timer-controls">' +
            '<span class="cooking-timer-display' + (timer.remainingSec <= 0 && timer.ringing ? " ringing" : "") + '" data-timer-display="' + recipeId + '|' + key + '">' + formatSecondsAsTimer(timer.remainingSec) + '</span>' +
            '<button class="cooking-timer-btn" data-timer-toggle="' + recipeId + '|' + key + '">' + (timer.running ? (isRo ? "Pauză" : "Pause") : (isRo ? "Start" : "Start")) + '</button>' +
            '<button class="cooking-timer-btn secondary" data-timer-reset="' + recipeId + '|' + key + '">↺</button>' +
            '</div></div>';
        }

        content.querySelectorAll("[data-step-key]").forEach((el) => {
          el.addEventListener("click", () => {
            const recipeId = el.dataset.recipeId;
            const key = el.dataset.stepKey;
            const s = state.get(recipeId);
            s.doneSteps[key] = !s.doneSteps[key];
            refresh();
          });
        });

        content.querySelectorAll("[data-timer-toggle]").forEach((el) => {
          el.addEventListener("click", () => {
            const [recipeId, key] = el.dataset.timerToggle.split("|");
            const timer = state.get(recipeId).timers[key];
            if (timer.running) {
              clearInterval(timer.intervalId);
              timer.intervalId = null;
              timer.running = false;
            } else {
              timer.running = true;
              timer.intervalId = setInterval(() => {
                timer.remainingSec -= 1;
                if (timer.remainingSec <= 0) {
                  timer.remainingSec = 0;
                  timer.running = false;
                  timer.ringing = true;
                  clearInterval(timer.intervalId);
                  timer.intervalId = null;
                  playCookingAlarm();
                  alert((isRo ? "Timpul a expirat: " : "Time's up: ") + label(recipeId, key));
                  refresh();
                  return;
                }
                const display = content.querySelector('[data-timer-display="' + recipeId + '|' + key + '"]');
                if (display) display.textContent = formatSecondsAsTimer(timer.remainingSec);
              }, 1000);
            }
            refresh();
          });
        });

        function label(recipeId, key) {
          const rec = recipesData.find((r) => r && r.id === recipeId);
          return (rec ? rec.name : "") + " — " + (key === "boil" ? (isRo ? "Fierbere" : "Boil") : (isRo ? "Cuptor" : "Oven"));
        }

        content.querySelectorAll("[data-timer-reset]").forEach((el) => {
          el.addEventListener("click", () => {
            const [recipeId, key] = el.dataset.timerReset.split("|");
            const timer = state.get(recipeId).timers[key];
            if (timer.intervalId) clearInterval(timer.intervalId);
            timer.intervalId = null;
            timer.running = false;
            timer.ringing = false;
            timer.remainingSec = timer.totalSec;
            refresh();
          });
        });

        content.querySelectorAll("[data-start-id]").forEach((el) => {
          el.addEventListener("click", async () => {
            const recipeId = el.dataset.startId;
            const s = state.get(recipeId);
            if (s.startedAt) return;
            s.startedAt = nowISO();
            s.sessionId = uuid();
            s.elapsedSec = 0;
            s.running = true;
            s.lastResumeTs = Date.now();
            await DB.put("cookingSessions", { id: s.sessionId, recipeId, startDateTime: s.startedAt });
            s.elapsedIntervalId = setInterval(() => {
              const display = content.querySelector('[data-elapsed-display="' + recipeId + '"]');
              if (display) display.textContent = formatElapsed(currentElapsedSec(s));
            }, 1000);
            refresh();
          });
        });

        content.querySelectorAll("[data-elapsed-toggle]").forEach((el) => {
          el.addEventListener("click", () => {
            const recipeId = el.dataset.elapsedToggle;
            const s = state.get(recipeId);
            if (s.running) {
              s.elapsedSec += (Date.now() - s.lastResumeTs) / 1000;
              s.running = false;
              s.lastResumeTs = null;
              if (s.elapsedIntervalId) clearInterval(s.elapsedIntervalId);
              s.elapsedIntervalId = null;
            } else {
              s.running = true;
              s.lastResumeTs = Date.now();
              s.elapsedIntervalId = setInterval(() => {
                const display = content.querySelector('[data-elapsed-display="' + recipeId + '"]');
                if (display) display.textContent = formatElapsed(currentElapsedSec(s));
              }, 1000);
            }
            refresh();
          });
        });

        content.querySelectorAll("[data-finish-id]").forEach((el) => {
          el.addEventListener("click", async () => {
            const recipeId = el.dataset.finishId;
            const s = state.get(recipeId);
            ["boil", "oven"].forEach((k) => {
              if (s.timers[k].intervalId) clearInterval(s.timers[k].intervalId);
            });
            if (s.elapsedIntervalId) clearInterval(s.elapsedIntervalId);
            s.elapsedIntervalId = null;
            let durationMinutes = null;
            if (s.startedAt) {
              s.finalElapsedSec = Math.round(currentElapsedSec(s));
              s.running = false;
              s.lastResumeTs = null;
              durationMinutes = Math.max(0, Math.round(s.finalElapsedSec / 60));
            }
            s.finished = true;
            const endDateTime = nowISO();
            const sessionRecord = { id: s.sessionId || uuid(), recipeId, endDateTime };
            if (s.startedAt) sessionRecord.startDateTime = s.startedAt;
            if (durationMinutes !== null) sessionRecord.durationMinutes = durationMinutes;
            await DB.put("cookingSessions", sessionRecord);
            const mr = menu.recipes.find((m) => m.recipeId === recipeId);
            if (mr) {
              mr.checked = true;
              menu.updatedAt = nowISO();
              await DB.put("menus", menu);
            }
            refresh();
            if (durationMinutes !== null) {
              const rec = recipesData.find((r) => r && r.id === recipeId);
              if (rec) openUpdateCookingTimePopup(rec, durationMinutes);
            }
          });
        });

        content.querySelectorAll("[data-view-steps-id]").forEach((el) => {
          el.addEventListener("click", () => {
            const rec = recipesData.find((r) => r && r.id === el.dataset.viewStepsId);
            openCookingInfoPopup(isRo ? "Pași de preparare" : "Preparation Steps", rec.preparationText || (isRo ? "Fără pași" : "No steps"), {
              photo: rec.preparationPhoto,
              sourceUrl: rec.sourceUrl
            });
          });
        });
        content.querySelectorAll("[data-view-ing-id]").forEach((el) => {
          el.addEventListener("click", () => {
            const rec = recipesData.find((r) => r && r.id === el.dataset.viewIngId);
            const html = (rec.ingredients || []).map((ri) =>
              escapeHtml(ri.name) + (ri.quantity ? " — " + ri.quantity + (ri.unit ? " " + escapeHtml(ri.unit) : "") : "")
            ).join("\n") || (isRo ? "Fără ingrediente" : "No ingredients");
            openCookingInfoPopup(isRo ? "Ingrediente" : "Ingredients", html);
          });
        });
      }
    });
    return screen;
  }
  window.openCookingMode = openCookingMode;

  function normalizeUrl(url) {
    if (!url) return url;
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) ? url : "https://" + url;
  }

  function openCookingInfoPopup(title, text, extras) {
    const isRo = I18N.lang === "ro";
    extras = extras || {};
    pushScreen({
      title,
      left: { label: isRo ? "Închide" : "Close" },
      render(content) {
        const normalizedUrl = normalizeUrl(extras.sourceUrl);
        content.innerHTML =
          (extras.photo ? '<img class="cooking-info-photo" id="cooking-info-photo" src="' + extras.photo + '"/>' : "") +
          (normalizedUrl ? '<a class="cooking-info-link" href="' + escapeAttr(normalizedUrl) + '" target="_blank" rel="noopener">🔗 ' + escapeHtml(extras.sourceUrl) + '</a><br/>' : "") +
          '<div class="placeholder" style="white-space:pre-wrap;text-align:left;">' + escapeHtml(text) + '</div>';

        const photoEl = content.querySelector("#cooking-info-photo");
        if (photoEl) {
          photoEl.addEventListener("click", () => openImageLightbox(extras.photo));
        }
      }
    });
  }

  function openUpdateCookingTimePopup(rec, suggestedMinutes) {
    const isRo = I18N.lang === "ro";
    const screen = pushScreen({
      title: isRo ? "Timp de gătit" : "Cooking Time",
      left: { label: isRo ? "Anulează" : "Cancel" },
      right: {
        label: isRo ? "Salvează" : "Save",
        action: async (close) => {
          const input = screen.element.querySelector("#cooking-time-input");
          const val = parseFloat(input.value);
          if (!isNaN(val)) {
            rec.totalDuration = val;
            rec.updatedAt = nowISO();
            await DB.put("recipes", rec);
          }
          close();
        }
      },
      render(content) {
        content.innerHTML =
          '<div class="placeholder">' + (isRo ? "A durat " + suggestedMinutes + " minute. Actualizezi timpul de gătit al rețetei?" : "It took " + suggestedMinutes + " minutes. Update the recipe's cooking time?") + '</div>' +
          '<div class="form-row"><label>' + (isRo ? "Minute" : "Minutes") + '</label><input type="number" id="cooking-time-input" value="' + suggestedMinutes + '"/></div>';
      }
    });
    return screen;
  }

  function openImageLightbox(src) {
    const overlay = document.createElement("div");
    overlay.className = "lightbox-overlay";
    overlay.innerHTML = '<img src="' + src + '"/>';
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const img = overlay.querySelector("img");
    img.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  }

  async function openMenuDetail(menuId, onListChanged) {
    const isRo = I18N.lang === "ro";
    let menu = await DB.get("menus", menuId);

    const screen = pushScreen({
      title: menu.name,
      left: {
        label: isRo ? "Terminat" : "Done",
        action: (close) => { close(); onListChanged && onListChanged(); }
      },
      async render(content, refresh) {
        const recipesData = await Promise.all(menu.recipes.map((mr) => DB.get("recipes", mr.recipeId)));
        const remainingTime = menu.recipes.reduce((sum, mr, idx) => {
          if (mr.checked) return sum;
          const rec = recipesData[idx];
          return sum + ((rec && rec.totalDuration) || 0);
        }, 0);

        content.innerHTML =
          '<div class="form-row"><label>' + (isRo ? "Nume" : "Name") + '</label><input type="text" id="menu-name-input" value="' + escapeAttr(menu.name) + '"/></div>' +
          '<div class="form-row"><label>' + (isRo ? "Dată" : "Date") + '</label><input type="date" id="menu-date-input" value="' + (menu.date || "") + '"/></div>' +
          '<div class="group-header">' + (isRo ? "Rețete" : "Recipes") + '</div>' +
          '<div class="list-card" id="menu-recipes-list">' +
          menu.recipes.map((mr, idx) => {
            const rec = recipesData[idx];
            const icons = computeMethodIcons(rec);
            const time = rec && rec.totalDuration ? rec.totalDuration + "m" : "";
            return '<div class="list-row menu-recipe-row" data-menu-idx="' + idx + '">' +
              '<span class="checkbox-circle' + (mr.checked ? " checked" : "") + '" data-check-idx="' + idx + '">' + (mr.checked ? "✓" : "") + "</span>" +
              '<span class="row-title' + (mr.checked ? " strikethrough" : "") + '">' + escapeHtml(mr.name) + "</span>" +
              '<span><span class="method-icons">' + (time ? time + " " : "") + icons.map((i) => i.emoji).join(" ") + "</span>" +
              (icons.some((i) => i.text) ? '<span class="method-time">' + icons.filter((i) => i.text).map((i) => i.text).join(" · ") + "</span>" : "") +
              "</span>" +
              '<span class="info-btn" data-info-idx="' + idx + '">ⓘ</span>' +
              "</div>";
          }).join("") +
          "</div>" +
          '<div class="add-row" id="add-menu-recipe-row">+ ' + (isRo ? "Adaugă rețetă" : "Add recipe") + "</div>" +
          '<div class="menu-footer">' +
          '<button id="menu-shopping-btn">🛒 ' + (isRo ? "Listă cumpărături" : "Shopping List") + "</button>" +
          '<span>' + (isRo ? "Total: " : "Total: ") + remainingTime + "m</span>" +
          '<button id="menu-cooking-btn">👩‍🍳</button>' +
          "</div>";

        attachAutoCapitalize(content.querySelector("#menu-name-input"), (val) => { menu.name = val; });
        content.querySelector("#menu-name-input").addEventListener("change", async (e) => {
          menu.name = e.target.value.trim() || menu.name;
          menu.updatedAt = nowISO();
          await DB.put("menus", menu);
        });
        content.querySelector("#menu-date-input").addEventListener("change", async (e) => {
          menu.date = e.target.value;
          menu.updatedAt = nowISO();
          await DB.put("menus", menu);
        });

        content.querySelectorAll("[data-check-idx]").forEach((el) => {
          el.addEventListener("click", async () => {
            const idx = parseInt(el.dataset.checkIdx, 10);
            menu.recipes[idx].checked = !menu.recipes[idx].checked;
            menu.updatedAt = nowISO();
            await DB.put("menus", menu);
            refresh();
          });
        });
        content.querySelectorAll("[data-info-idx]").forEach((el) => {
          el.addEventListener("click", () => {
            const idx = parseInt(el.dataset.infoIdx, 10);
            openRecipeEditor(menu.recipes[idx].recipeId, refresh);
          });
        });
        content.querySelectorAll("[data-menu-idx]").forEach((row) => {
          makeSwipeable(row, async () => {
            const idx = parseInt(row.dataset.menuIdx, 10);
            menu.recipes.splice(idx, 1);
            menu.updatedAt = nowISO();
            await DB.put("menus", menu);
            refresh();
          });
        });

        content.querySelector("#add-menu-recipe-row").addEventListener("click", () => {
          openRecipePickerForMenu(menu, refresh);
        });
        content.querySelector("#menu-shopping-btn").addEventListener("click", () => {
          openMenuShoppingList(menu);
        });
        content.querySelector("#menu-cooking-btn").addEventListener("click", () => {
          openCookingMode(menu, refresh);
        });
      }
    });
  }
  window.openMenuDetail = openMenuDetail;

  async function renderMenusScreen() {
    const listEl = document.getElementById("menus-list");
    const searchInput = document.getElementById("menus-search");
    if (!listEl) return;

    async function draw() {
      const filter = (searchInput.value || "").toLowerCase();
      const menus = await DB.getAll("menus");
      const filtered = menus.filter((m) => m.name.toLowerCase().includes(filter));
      filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      const card = document.createElement("div");
      card.className = "list-card";
      filtered.forEach((menu) => {
        const row = document.createElement("div");
        row.className = "list-row tappable";
        row.innerHTML = '<span class="row-title">' + escapeHtml(menu.name) + '</span><span class="rating-badge">' + formatMenuDate(menu.date) + "</span>";
        row.addEventListener("click", () => openMenuDetail(menu.id, draw));
        card.appendChild(row);
        makeSwipeable(row, async () => {
          await DB.delete("menus", menu.id);
          draw();
        });
      });
      listEl.innerHTML = "";
      listEl.appendChild(card);
    }

    searchInput.oninput = draw;
    await draw();
  }
  window.renderMenusScreen = renderMenusScreen;

  window.onMenusTabActivated = function (rightBtn) {
    rightBtn.style.display = "inline-flex";
    rightBtn.textContent = "+";
    rightBtn.onclick = () => createAndOpenMenu(renderMenusScreen);
    renderMenusScreen();
  };

})();

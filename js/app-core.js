(function () {
  "use strict";

  /* =========================================================
     i18n
     ========================================================= */
  const STRINGS = {
    en: {
      "tab.menus": "Menus",
      "tab.recipes": "Recipes",
      "tab.shopping": "Shopping",
      "tab.ingredients": "Products",
      "tab.admin": "Admin",
      "nav.menus": "Menus",
      "nav.recipes": "Recipes",
      "nav.shopping": "Shopping List",
      "nav.ingredients": "Products",
      "nav.admin": "Admin",
      "admin.familyMembers": "Family Members",
      "admin.addMember": "Add Family Member",
      "admin.memberName": "Name",
      "admin.settings": "Settings",
      "admin.language": "Language",
      "admin.accentColor": "Accent Color",
      "admin.dataManagement": "Data Management",
      "admin.exportData": "Export Data (Backup)",
      "admin.importData": "Import Data (Restore)",
      "admin.importConfirm": "This will merge data from the selected backup into your current data: records that do not already exist will be added. No deletions or replacements will be performed. Continue?",
      "admin.importSuccess": "Data imported successfully. Reloading app...",
      "admin.importError": "Failed to import data. Please make sure the file is a valid MyRecipes backup.",
      "admin.exportSuccess": "Backup file downloaded.",
      "admin.categoryManagement": "Category Management",
      "admin.manageRecipeCategories": "Manage Recipe Categories",
      "admin.manageIngredientCategories": "Manage Product Categories",
      "admin.recipeCategories": "Recipe Categories",
      "admin.ingredientCategories": "Product Categories",
      "admin.addCategory": "Add Category",
      "admin.categoryName": "Category Name",
      "admin.deleteCategoryConfirm": "Delete this category? Items using it will become uncategorized."
    },
    ro: {
      "tab.menus": "Meniuri",
      "tab.recipes": "Rețete",
      "tab.shopping": "Cumpărături",
      "tab.ingredients": "Produse",
      "tab.admin": "Admin",
      "nav.menus": "Meniuri",
      "nav.recipes": "Rețete",
      "nav.shopping": "Listă cumpărături",
      "nav.ingredients": "Produse",
      "nav.admin": "Admin",
      "admin.familyMembers": "Membrii familiei",
      "admin.addMember": "Adaugă membru",
      "admin.memberName": "Nume",
      "admin.settings": "Setări",
      "admin.language": "Limbă",
      "admin.accentColor": "Culoare accent",
      "admin.dataManagement": "Gestionare date",
      "admin.exportData": "Exportă datele (Backup)",
      "admin.importData": "Importă date (Restaurare)",
      "admin.importConfirm": "Aceasta va îmbina datele din fișierul de backup selectat cu datele curente: înregistrările care nu există deja vor fi adăugate. Nu se vor efectua ștergeri sau înlocuiri. Continuați?",
      "admin.importSuccess": "Datele au fost importate cu succes. Se reîncarcă aplicația...",
      "admin.importError": "Importul datelor a eșuat. Asigurați-vă că fișierul este un backup valid MyRecipes.",
      "admin.exportSuccess": "Fișierul de backup a fost descărcat.",
      "admin.categoryManagement": "Gestionare categorii",
      "admin.manageRecipeCategories": "Gestionează categorii rețete",
      "admin.manageIngredientCategories": "Gestionează categorii produse",
      "admin.recipeCategories": "Categorii rețete",
      "admin.ingredientCategories": "Categorii produse",
      "admin.addCategory": "Adaugă categorie",
      "admin.categoryName": "Nume categorie",
      "admin.deleteCategoryConfirm": "Ștergi această categorie? Elementele care o folosesc vor rămâne fără categorie."
    }
  };

  const I18N = {
    lang: localStorage.getItem("myrecipes.lang") || "en",
    t(key) {
      const dict = STRINGS[I18N.lang] || STRINGS.en;
      return dict[key] || STRINGS.en[key] || key;
    },
    setLang(lang) {
      if (!STRINGS[lang]) return;
      I18N.lang = lang;
      localStorage.setItem("myrecipes.lang", lang);
      I18N.applyAll();
    },
    applyAll() {
      document.documentElement.lang = I18N.lang;
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        el.textContent = I18N.t(el.getAttribute("data-i18n"));
      });
      const navTitle = document.getElementById("nav-title");
      const activeTab = document.querySelector(".tab-btn.active");
      if (navTitle && activeTab) {
        navTitle.textContent = I18N.t("nav." + activeTab.dataset.tab);
      }
    }
  };
  window.I18N = I18N;

  /* =========================================================
     Accent color (applied instantly from localStorage,
     synced with the Settings store once IndexedDB is open)
     ========================================================= */
  const savedColor = localStorage.getItem("myrecipes.accentColor");
  if (savedColor) {
    document.documentElement.style.setProperty("--accent", savedColor);
  }
  window.setAccentColor = function (hex) {
    document.documentElement.style.setProperty("--accent", hex);
    localStorage.setItem("myrecipes.accentColor", hex);
    DB.put("settings", { id: "accentColor", value: hex });
  };

  /* =========================================================
     IndexedDB wrapper
     ========================================================= */
  const DB_NAME = "MyRecipesDB";
  const DB_VERSION = 2;
  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("recipes")) {
          const store = db.createObjectStore("recipes", { keyPath: "id" });
          store.createIndex("categoryId", "categoryId", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("ingredients")) {
          const store = db.createObjectStore("ingredients", { keyPath: "id" });
          store.createIndex("categoryId", "categoryId", { unique: false });
          store.createIndex("usageCount", "usageCount", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("recipeCategories")) {
          const store = db.createObjectStore("recipeCategories", { keyPath: "id" });
          store.createIndex("sortOrder", "sortOrder", { unique: false });
        }
        if (!db.objectStoreNames.contains("ingredientCategories")) {
          const store = db.createObjectStore("ingredientCategories", { keyPath: "id" });
          store.createIndex("sortOrder", "sortOrder", { unique: false });
        }
        if (!db.objectStoreNames.contains("menus")) {
          const store = db.createObjectStore("menus", { keyPath: "id" });
          store.createIndex("date", "date", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("cookingSessions")) {
          const store = db.createObjectStore("cookingSessions", { keyPath: "id" });
          store.createIndex("recipeId", "recipeId", { unique: false });
          store.createIndex("endDateTime", "endDateTime", { unique: false });
        }
        if (!db.objectStoreNames.contains("familyMembers")) {
          db.createObjectStore("familyMembers", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("shoppingList")) {
          const store = db.createObjectStore("shoppingList", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
        };
        resolve(dbInstance);
      };
      request.onerror = (event) => reject(event.target.error);
      request.onblocked = () => {
        console.warn("IndexedDB upgrade blocked by another open tab/connection.");
        reject(new Error("IndexedDB upgrade blocked. Please close other tabs/windows of this app and reload."));
      };
    });
  }

  function withStore(storeName, mode, callback) {
    return openDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = callback(store);
        tx.oncomplete = () => resolve(result && result.__result);
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  const DB = {
    open: openDB,
    getAll(storeName) {
      return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }));
    },
    get(storeName, id) {
      return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }));
    },
    put(storeName, record) {
      return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => reject(tx.error);
      }));
    },
    delete(storeName, id) {
      return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    },
    clear(storeName) {
      return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }
  };
  window.DB = DB;

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  window.uuid = uuid;
  window.nowISO = () => new Date().toISOString();

  /* =========================================================
     Seed default data on first run
     ========================================================= */
  async function seedIfEmpty() {
    const members = await DB.getAll("familyMembers");
    if (members.length === 0) {
      const defaults = ["Oana", "Andrei", "Robert"];
      for (const name of defaults) {
        await DB.put("familyMembers", { id: uuid(), name, updatedAt: nowISO() });
      }
    }

    const settings = await DB.getAll("settings");
    const settingsById = Object.fromEntries(settings.map((s) => [s.id, s]));
    if (!settingsById.lang) {
      await DB.put("settings", { id: "lang", value: I18N.lang });
    }
    if (!settingsById.accentColor) {
      await DB.put("settings", { id: "accentColor", value: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#007aff" });
    }

    await seedSampleData();
  }

  /* =========================================================
     Sample/test data (only inserted once, if recipes store is empty)
     ========================================================= */
  async function seedSampleData() {
    const existingRecipes = await DB.getAll("recipes");
    if (existingRecipes.length > 0) return;

    const now = nowISO();

    const ingCatLegume = { id: uuid(), name: "Legume", icon: "🥕", sortOrder: 0, updatedAt: now };
    const ingCatLactate = { id: uuid(), name: "Lactate", icon: "🧀", sortOrder: 1, updatedAt: now };
    await DB.put("ingredientCategories", ingCatLegume);
    await DB.put("ingredientCategories", ingCatLactate);

    const recCatPrincipal = { id: uuid(), name: "Fel principal", icon: "🍲", sortOrder: 0, updatedAt: now };
    const recCatDesert = { id: uuid(), name: "Desert", icon: "🍰", sortOrder: 1, updatedAt: now };
    await DB.put("recipeCategories", recCatPrincipal);
    await DB.put("recipeCategories", recCatDesert);

    const ingCartofi = {
      id: uuid(), categoryId: ingCatLegume.id, name: "Cartofi", note: "",
      units: [{ unit: "kg", defaultQty: 1 }], excludeFromShoppingList: false, usageCount: 0, updatedAt: now
    };
    const ingLapte = {
      id: uuid(), categoryId: ingCatLactate.id, name: "Lapte", note: "",
      units: [{ unit: "l", defaultQty: 1 }], excludeFromShoppingList: false, usageCount: 0, updatedAt: now
    };
    await DB.put("ingredients", ingCartofi);
    await DB.put("ingredients", ingLapte);

    const recCartofi = {
      id: uuid(), categoryId: recCatPrincipal.id, name: "Cartofi la cuptor",
      toggles: { wash: true, peel: true, cut: true, oven: true },
      boilTime: 20, ovenTemp: 200, ovenTime: 45, waitingHours: 8,
      ingredients: [{ ingredientId: ingCartofi.id, name: "Cartofi", unit: "kg", quantity: 1 }],
      preparationText: "Se spală, se curăță și se taie cartofii felii. Se coc la cuptor 45 de minute.",
      preparationPhoto: null, sourceUrl: "", totalDuration: 60,
      ratings: {}, photo: null, updatedAt: now
    };
    const recClatite = {
      id: uuid(), categoryId: recCatDesert.id, name: "Clătite",
      toggles: { mix: true },
      boilTime: 20, ovenTemp: 180, ovenTime: 60, waitingHours: 8,
      ingredients: [{ ingredientId: ingLapte.id, name: "Lapte", unit: "l", quantity: 0.5 }],
      preparationText: "Se amestecă toate ingredientele și se prăjesc clătitele pe ambele părți.",
      preparationPhoto: null, sourceUrl: "", totalDuration: 30,
      ratings: {}, photo: null, updatedAt: now
    };
    await DB.put("recipes", recCartofi);
    await DB.put("recipes", recClatite);
    ingCartofi.usageCount = 1; ingLapte.usageCount = 1;
    await DB.put("ingredients", ingCartofi);
    await DB.put("ingredients", ingLapte);

    const today = new Date();
    const dateStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const sampleMenu = {
      id: uuid(), name: "Meniu de duminică", date: dateStr,
      recipes: [
        { recipeId: recCartofi.id, name: recCartofi.name, checked: false },
        { recipeId: recClatite.id, name: recClatite.name, checked: false }
      ],
      updatedAt: now
    };
    await DB.put("menus", sampleMenu);
  }

  /* =========================================================
     Tab navigation
     ========================================================= */
  function activateTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    document.querySelectorAll(".screen").forEach((scr) => {
      scr.classList.toggle("active", scr.dataset.screen === tabName);
    });
    const navTitle = document.getElementById("nav-title");
    if (navTitle) navTitle.textContent = I18N.t("nav." + tabName);
    if (typeof window.onTabActivated === "function") {
      window.onTabActivated(tabName);
    }
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  /* =========================================================
     Service worker registration
     ========================================================= */
  if ("serviceWorker" in navigator) {
    // Disable the service worker to avoid offline/cached responses
    // when a new version is deployed. On load, unregister any existing
    // service workers and clear the caches used by the app.
    window.addEventListener("load", async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
        if (window.caches && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        console.info("Service workers unregistered and caches cleared.");
      } catch (err) {
        console.warn("Failed to unregister service workers:", err);
      }
    });
  }

  /* =========================================================
     Init
     ========================================================= */
  openDB()
    .then(() => seedIfEmpty())
    .then(() => {
      I18N.applyAll();
      if (typeof window.onTabActivated === "function") {
        window.onTabActivated("menus");
      }
    })
    .catch((err) => {
      console.error("DB init failed:", err);
      alert((err && err.message) || "Failed to open the database. Please close other tabs of this app and reload.");
    });

})();

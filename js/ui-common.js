(function () {
  "use strict";

  /* =========================================================
     Screen stack (push/pop full-screen overlays)
     ========================================================= */
  const overlayRoot = document.getElementById("overlay-root");

  function pushScreen({ title, left, right, render }) {
    const el = document.createElement("div");
    el.className = "overlay-screen";
    el.innerHTML =
      '<div class="nav-bar"><div class="nav-bar-inner">' +
      '<button class="nav-btn left" data-nav="left"></button>' +
      '<span class="nav-title"></span>' +
      '<button class="nav-btn right" data-nav="right"></button>' +
      "</div></div>" +
      '<div class="overlay-content"></div>';
    el.querySelector(".nav-title").textContent = title || "";
    overlayRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add("active"));

    const content = el.querySelector(".overlay-content");
    const leftBtn = el.querySelector('[data-nav="left"]');
    const rightBtn = el.querySelector('[data-nav="right"]');

    function close() {
      el.classList.remove("active");
      setTimeout(() => el.remove(), 300);
    }
    function refresh() {
      content.innerHTML = "";
      render(content, refresh, close);
    }

    if (left) {
      leftBtn.textContent = left.label || "";
      leftBtn.addEventListener("click", () => (left.action ? left.action(close, refresh) : close()));
    }
    if (right) {
      rightBtn.textContent = right.label || "";
      rightBtn.addEventListener("click", () => right.action(close, refresh));
    }

    render(content, refresh, close);
    return { close, refresh, element: el };
  }
  window.pushScreen = pushScreen;

    /* =========================================================
     Swipe-to-delete helper (works with touch AND mouse,
     closes any other open row automatically, like iOS lists)
     ========================================================= */
  let currentOpenSwipeRow = null;

  function closeSwipeRow(rowEl) {
    if (!rowEl) return;
    rowEl.style.transition = "transform 0.2s";
    rowEl.style.transform = "translateX(0)";
    rowEl.dataset.dx = 0;
    rowEl.dataset.swipeOpen = "false";
    if (currentOpenSwipeRow === rowEl) currentOpenSwipeRow = null;
  }

    function makeSwipeable(rowEl, onDelete) {
        const wrapper = document.createElement("div");
        wrapper.className = "swipe-container";
        rowEl.classList.add("swipe-content");
        rowEl.parentNode.insertBefore(wrapper, rowEl);

        // IMPORTANT: the delete button must be placed BEHIND the row in the
        // stacking order, so the row's opaque background hides it at rest.
        // It only becomes visible once the row is translated to the left.
        const delBtn = document.createElement("button");
        delBtn.className = "swipe-delete-btn";
        delBtn.textContent = I18N.lang === "ro" ? "Șterge" : "Delete";
        wrapper.appendChild(delBtn);   // delBtn first (underneath)
        wrapper.appendChild(rowEl);    // rowEl second (on top, covers delBtn)

        // Keep a reference to the wrapper so the global "close on outside
        // tap" listener can tell that a tap on the delete button itself
        // (a sibling of rowEl, not a descendant) is NOT "outside".
        rowEl._swipeWrapper = wrapper;

        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            onDelete();
        });


    const DELETE_WIDTH = 80;
    let startX = 0, startY = 0, currentX = 0, dragging = false, decided = false, isHorizontal = false;

    function onPointerDown(e) {
      // Ignore secondary buttons (right-click etc.)
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Close any other open row first
      if (currentOpenSwipeRow && currentOpenSwipeRow !== rowEl) {
        closeSwipeRow(currentOpenSwipeRow);
      }
      startX = e.clientX;
      startY = e.clientY;
      dragging = true;
      decided = false;
      isHorizontal = false;
      rowEl.style.transition = "none";
      rowEl.setPointerCapture && rowEl.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const dx0 = e.clientX - startX;
      const dy0 = e.clientY - startY;

      if (!decided) {
        // Decide whether this gesture is a horizontal swipe or a vertical scroll
        if (Math.abs(dx0) > 6 || Math.abs(dy0) > 6) {
          decided = true;
          isHorizontal = Math.abs(dx0) > Math.abs(dy0);
        } else {
          return;
        }
      }
      if (!isHorizontal) return; // let vertical scroll happen normally

      e.preventDefault();
      let dx = dx0 + currentX;
      dx = Math.min(0, Math.max(dx, -DELETE_WIDTH));
      rowEl.style.transform = "translateX(" + dx + "px)";
      rowEl.dataset.dx = dx;
    }

    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      rowEl.releasePointerCapture && e.pointerId != null && rowEl.releasePointerCapture(e.pointerId);
      if (!isHorizontal) return;

      rowEl.style.transition = "transform 0.2s";
      const dx = parseFloat(rowEl.dataset.dx || "0");
      if (dx < -DELETE_WIDTH / 2) {
        rowEl.style.transform = "translateX(-" + DELETE_WIDTH + "px)";
        currentX = -DELETE_WIDTH;
        rowEl.dataset.swipeOpen = "true";
        currentOpenSwipeRow = rowEl;
      } else {
        rowEl.style.transform = "translateX(0)";
        currentX = 0;
        rowEl.dataset.swipeOpen = "false";
        if (currentOpenSwipeRow === rowEl) currentOpenSwipeRow = null;
      }
    }

    rowEl.addEventListener("pointerdown", onPointerDown);
    rowEl.addEventListener("pointermove", onPointerMove);
    rowEl.addEventListener("pointerup", onPointerUp);
    rowEl.addEventListener("pointercancel", onPointerUp);

    // Prevent an accidental "click" (e.g. opening the recipe editor)
    // right after a swipe gesture.
    rowEl.addEventListener("click", (e) => {
      if (rowEl.dataset.swipeOpen === "true" || decided && isHorizontal) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    return wrapper;
  }
  window.makeSwipeable = makeSwipeable;

    // Tapping anywhere outside an open swiped row closes it (iOS-like behavior).
    // Important: check the WRAPPER (row + delete button), not just the row,
    // otherwise tapping the delete button itself would be treated as an
    // "outside tap" and would close the swipe before the delete click fires.
    document.addEventListener("pointerdown", (e) => {
        if (!currentOpenSwipeRow) return;
        const wrapper = currentOpenSwipeRow._swipeWrapper;
        if (wrapper && !wrapper.contains(e.target)) {
            closeSwipeRow(currentOpenSwipeRow);
        }
    });

})();


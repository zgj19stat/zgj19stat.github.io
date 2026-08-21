(function () {
  "use strict";

  var root = document.querySelector(".research-hypergraph");
  if (!root) return;

  var narrowScreen = window.matchMedia("(max-width: 800px)");
  var coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");
  if (narrowScreen.matches || coarsePointer.matches) return;

  var canvas = root.querySelector("[data-research-map-canvas]");
  var panel = root.querySelector("[data-research-map-panel]");
  var defaultPanel = panel ? panel.innerHTML : "";
  var templates = new Map();
  var shapesByEdge = new Map();
  var membersByEdge = new Map();
  var paperById = new Map();
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var pinnedState = null;
  var transientState = null;
  var clearTimer = null;
  var highlightTimer = null;
  var pointerFrame = null;
  var canvasBounds = null;

  root.querySelectorAll("[data-map-template]").forEach(function (template) {
    templates.set(template.getAttribute("data-map-template"), template.innerHTML);
  });

  root.querySelectorAll("[data-hyperedge-shape]").forEach(function (shape) {
    var id = shape.getAttribute("data-hyperedge-shape");
    if (!shapesByEdge.has(id)) shapesByEdge.set(id, []);
    shapesByEdge.get(id).push(shape);
  });

  root.querySelectorAll("[data-hyperedge-target]").forEach(function (target) {
    var id = target.getAttribute("data-hyperedge-target");
    membersByEdge.set(id, new Set(splitTokens(target.getAttribute("data-members"))));
  });

  root.querySelectorAll("[data-work-id]").forEach(function (paper) {
    paperById.set(paper.getAttribute("data-work-id"), paper);
  });

  function splitTokens(value) {
    return (value || "").trim().split(/\s+/).filter(Boolean);
  }

  function currentState() {
    return transientState || pinnedState;
  }

  function scheduleTransientClear() {
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(function () {
      transientState = null;
      renderState();
    }, 120);
  }

  function cancelTransientClear() {
    window.clearTimeout(clearTimer);
  }

  function setTransient(type, id) {
    cancelTransientClear();
    transientState = { type: type, id: id };
    renderState();
  }

  function togglePinnedEdge(id) {
    transientState = null;
    if (pinnedState && pinnedState.type === "hyperedge" && pinnedState.id === id) {
      pinnedState = null;
    } else {
      pinnedState = { type: "hyperedge", id: id };
    }
    renderState();
  }

  function renderState() {
    var state = currentState();
    var activeEdges = new Set();
    var activeWorks = new Set();
    var selectedWork = null;

    if (state && state.type === "hyperedge") {
      activeEdges.add(state.id);
      (membersByEdge.get(state.id) || new Set()).forEach(function (id) {
        activeWorks.add(id);
      });
    }

    if (state && state.type === "work") {
      selectedWork = state.id;
      var paper = paperById.get(state.id);
      splitTokens(paper && paper.getAttribute("data-hyperedges")).forEach(function (id) {
        activeEdges.add(id);
        (membersByEdge.get(id) || new Set()).forEach(function (workId) {
          activeWorks.add(workId);
        });
      });
    }

    shapesByEdge.forEach(function (shapes, id) {
      shapes.forEach(function (shape) {
        shape.classList.toggle("is-active", activeEdges.has(id));
        shape.classList.toggle("is-muted", Boolean(state) && !activeEdges.has(id));
      });
    });

    root.querySelectorAll("[data-hyperedge-label]").forEach(function (label) {
      var id = label.getAttribute("data-hyperedge-label");
      label.classList.toggle("is-active", activeEdges.has(id));
      label.classList.toggle("is-muted", Boolean(state) && !activeEdges.has(id));
      label.setAttribute(
        "aria-pressed",
        pinnedState && pinnedState.type === "hyperedge" && pinnedState.id === id ? "true" : "false"
      );
    });

    paperById.forEach(function (paper, id) {
      paper.classList.toggle("is-active", activeWorks.has(id));
      paper.classList.toggle("is-selected", selectedWork === id);
      paper.classList.toggle("is-muted", Boolean(state) && !activeWorks.has(id));
    });

    if (!panel) return;
    var templateKey = state ? state.type + ":" + state.id : null;
    panel.innerHTML = templateKey && templates.has(templateKey) ? templates.get(templateKey) : defaultPanel;
  }

  root.querySelectorAll("[data-hyperedge-target]").forEach(function (target) {
    var id = target.getAttribute("data-hyperedge-target");
    target.addEventListener("pointerenter", function () {
      setTransient("hyperedge", id);
    });
    target.addEventListener("pointerleave", scheduleTransientClear);
    target.addEventListener("click", function () {
      togglePinnedEdge(id);
    });
  });

  root.querySelectorAll("[data-hyperedge-label]").forEach(function (label) {
    var id = label.getAttribute("data-hyperedge-label");
    label.addEventListener("pointerenter", function () {
      setTransient("hyperedge", id);
    });
    label.addEventListener("pointerleave", scheduleTransientClear);
    label.addEventListener("focus", function () {
      setTransient("hyperedge", id);
    });
    label.addEventListener("blur", scheduleTransientClear);
    label.addEventListener("click", function () {
      togglePinnedEdge(id);
    });
    label.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        togglePinnedEdge(id);
      }
    });
  });

  paperById.forEach(function (paper, id) {
    paper.addEventListener("pointerenter", function () {
      setTransient("work", id);
    });
    paper.addEventListener("pointerleave", scheduleTransientClear);
    paper.addEventListener("focus", function () {
      setTransient("work", id);
    });
    paper.addEventListener("blur", scheduleTransientClear);
    paper.addEventListener("click", function (event) {
      navigateToEntry(event, paper);
    });
    paper.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        navigateToEntry(event, paper);
      }
    });
  });

  if (panel) {
    panel.addEventListener("pointerenter", cancelTransientClear);
    panel.addEventListener("pointerleave", scheduleTransientClear);
  }

  root.addEventListener("click", function (event) {
    if (event.defaultPrevented) return;
    var link = event.target.closest('a[href^="#"]');
    if (!link) return;

    navigateToEntry(event, link);
  });

  function navigateToEntry(event, link) {
    if (!link) return;

    var hash = link.getAttribute("data-href") || link.getAttribute("href");
    var target = hash && document.getElementById(hash.slice(1));
    if (!target) return;

    event.preventDefault();
    if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }

    target.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
    target.classList.add("is-map-target");
    window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(function () {
      target.classList.remove("is-map-target");
    }, 4000);
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || (!pinnedState && !transientState)) return;
    pinnedState = null;
    transientState = null;
    renderState();
  });

  if (canvas && !reducedMotion.matches) {
    canvas.addEventListener("pointerenter", function () {
      canvasBounds = canvas.getBoundingClientRect();
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!canvasBounds) canvasBounds = canvas.getBoundingClientRect();
      var x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 100;
      var y = ((event.clientY - canvasBounds.top) / canvasBounds.height) * 100;

      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pointerFrame = window.requestAnimationFrame(function () {
        canvas.style.setProperty("--map-pointer-x", Math.max(0, Math.min(100, x)) + "%");
        canvas.style.setProperty("--map-pointer-y", Math.max(0, Math.min(100, y)) + "%");
      });
    });

    canvas.addEventListener("pointerleave", function () {
      canvas.style.setProperty("--map-pointer-x", "50%");
      canvas.style.setProperty("--map-pointer-y", "-20%");
    });

    window.addEventListener("resize", function () {
      canvasBounds = null;
    }, { passive: true });
  }
})();

(function () {
  "use strict";

  var root = document.querySelector(".research-hypergraph");
  if (!root) return;

  var narrowScreen = window.matchMedia("(max-width: 800px)");
  var coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");
  if (narrowScreen.matches || coarsePointer.matches) return;

  var canvas = root.querySelector("[data-research-map-canvas]");
  var svg = canvas ? canvas.querySelector("svg") : null;
  var svgViewBox = parseViewBox(svg);
  var panel = root.querySelector("[data-research-map-panel]");
  var defaultPanel = panel ? panel.innerHTML : "";
  var templates = new Map();
  var shapesByEdge = new Map();
  var membersByEdge = new Map();
  var paperById = new Map();
  var edgeGeometry = [];
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hitRadius = Number(canvas && canvas.getAttribute("data-hit-radius")) || 18;
  var hitHysteresis = 5;
  var pinnedState = null;
  var transientState = null;
  var proximityEdgeId = null;
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
    edgeGeometry.push({ id: id, points: samplePath(target.getAttribute("d")) });
  });

  root.querySelectorAll("[data-work-id]").forEach(function (paper) {
    paperById.set(paper.getAttribute("data-work-id"), paper);
  });

  function splitTokens(value) {
    return (value || "").trim().split(/\s+/).filter(Boolean);
  }

  function parseViewBox(element) {
    var values = element ? splitTokens((element.getAttribute("viewBox") || "").replace(/,/g, " ")).map(Number) : [];
    if (values.length !== 4 || values.some(function (value) { return !Number.isFinite(value); })) return null;
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }

  function samplePath(pathData) {
    var tokens = (pathData || "").match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
    var points = [];
    var cursor = { x: 0, y: 0 };
    var start = null;
    var command = null;
    var index = 0;

    function hasNumbers(count) {
      return index + count <= tokens.length && tokens.slice(index, index + count).every(function (token) {
        return !/^[A-Za-z]$/.test(token);
      });
    }

    function nextNumber() {
      var value = Number(tokens[index]);
      index += 1;
      return value;
    }

    function addLine(end) {
      var estimate = Math.hypot(end.x - cursor.x, end.y - cursor.y);
      var count = Math.max(1, Math.ceil(estimate / 7));
      for (var step = 1; step <= count; step += 1) {
        var amount = step / count;
        points.push({
          x: cursor.x + (end.x - cursor.x) * amount,
          y: cursor.y + (end.y - cursor.y) * amount
        });
      }
      cursor = end;
    }

    function addCubic(controlOne, controlTwo, end) {
      var estimate =
        Math.hypot(controlOne.x - cursor.x, controlOne.y - cursor.y) +
        Math.hypot(controlTwo.x - controlOne.x, controlTwo.y - controlOne.y) +
        Math.hypot(end.x - controlTwo.x, end.y - controlTwo.y);
      var count = Math.max(4, Math.ceil(estimate / 7));
      var origin = { x: cursor.x, y: cursor.y };

      for (var step = 1; step <= count; step += 1) {
        var amount = step / count;
        var inverse = 1 - amount;
        points.push({
          x:
            inverse * inverse * inverse * origin.x +
            3 * inverse * inverse * amount * controlOne.x +
            3 * inverse * amount * amount * controlTwo.x +
            amount * amount * amount * end.x,
          y:
            inverse * inverse * inverse * origin.y +
            3 * inverse * inverse * amount * controlOne.y +
            3 * inverse * amount * amount * controlTwo.y +
            amount * amount * amount * end.y
        });
      }
      cursor = end;
    }

    while (index < tokens.length) {
      if (/^[A-Za-z]$/.test(tokens[index])) {
        command = tokens[index].toUpperCase();
        index += 1;
      }

      if (command === "M" && hasNumbers(2)) {
        cursor = { x: nextNumber(), y: nextNumber() };
        start = { x: cursor.x, y: cursor.y };
        points.push({ x: cursor.x, y: cursor.y });
        command = "L";
      } else if (command === "L" && hasNumbers(2)) {
        addLine({ x: nextNumber(), y: nextNumber() });
      } else if (command === "C" && hasNumbers(6)) {
        addCubic(
          { x: nextNumber(), y: nextNumber() },
          { x: nextNumber(), y: nextNumber() },
          { x: nextNumber(), y: nextNumber() }
        );
      } else if (command === "Z") {
        if (start && (cursor.x !== start.x || cursor.y !== start.y)) addLine(start);
        command = null;
      } else {
        break;
      }
    }

    return points;
  }

  function pointerToSvg(clientX, clientY) {
    if (!svg || !svgViewBox) return null;

    var bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !svgViewBox.width || !svgViewBox.height) return null;

    var scale = Math.min(bounds.width / svgViewBox.width, bounds.height / svgViewBox.height);
    var renderedWidth = svgViewBox.width * scale;
    var renderedHeight = svgViewBox.height * scale;
    var left = bounds.left + (bounds.width - renderedWidth) / 2;
    var top = bounds.top + (bounds.height - renderedHeight) / 2;

    return {
      x: svgViewBox.x + (clientX - left) / scale,
      y: svgViewBox.y + (clientY - top) / scale
    };
  }

  function distanceToSamples(point, samples) {
    var minimumSquaredDistance = Infinity;

    samples.forEach(function (sample) {
      var deltaX = point.x - sample.x;
      var deltaY = point.y - sample.y;
      var squaredDistance = deltaX * deltaX + deltaY * deltaY;
      if (squaredDistance < minimumSquaredDistance) minimumSquaredDistance = squaredDistance;
    });

    return Math.sqrt(minimumSquaredDistance);
  }

  function nearestEdge(point) {
    if (!point) return null;

    var closestId = null;
    var closestDistance = Infinity;
    var currentDistance = Infinity;

    edgeGeometry.forEach(function (geometry) {
      var distance = distanceToSamples(point, geometry.points);
      if (geometry.id === proximityEdgeId) currentDistance = distance;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = geometry.id;
      }
    });

    if (proximityEdgeId && currentDistance <= hitRadius + hitHysteresis) {
      if (closestId !== proximityEdgeId && closestDistance + 3 < currentDistance) return closestId;
      return proximityEdgeId;
    }

    return closestDistance <= hitRadius ? closestId : null;
  }

  function isInteractiveMapTarget(target) {
    return Boolean(
      target &&
      typeof target.closest === "function" &&
      target.closest("[data-work-id], [data-hyperedge-label]")
    );
  }

  function currentState() {
    return transientState || pinnedState;
  }

  function scheduleTransientClear() {
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(function () {
      proximityEdgeId = null;
      if (canvas) {
        canvas.classList.remove("has-edge-nearby");
        canvas.removeAttribute("data-nearest-edge");
      }
      transientState = null;
      renderState();
    }, 120);
  }

  function cancelTransientClear() {
    window.clearTimeout(clearTimer);
  }

  function setTransient(type, id, source) {
    cancelTransientClear();
    transientState = { type: type, id: id, source: source || "direct" };
    renderState();
  }

  function setDirectTransient(type, id) {
    proximityEdgeId = null;
    if (canvas) {
      canvas.classList.remove("has-edge-nearby");
      canvas.removeAttribute("data-nearest-edge");
    }
    setTransient(type, id, "direct");
  }

  function updateProximity(clientX, clientY) {
    var edgeId = nearestEdge(pointerToSvg(clientX, clientY));
    if (edgeId === proximityEdgeId) return;

    proximityEdgeId = edgeId;
    if (canvas) {
      canvas.classList.toggle("has-edge-nearby", Boolean(edgeId));
      if (edgeId) {
        canvas.setAttribute("data-nearest-edge", edgeId);
      } else {
        canvas.removeAttribute("data-nearest-edge");
      }
    }

    if (edgeId) {
      setTransient("hyperedge", edgeId, "proximity");
    } else if (transientState && transientState.source === "proximity") {
      transientState = null;
      renderState();
    }
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

    root.setAttribute("data-active-map-edges", Array.from(activeEdges).join(" "));
    if (selectedWork) {
      root.setAttribute("data-active-map-work", selectedWork);
    } else {
      root.removeAttribute("data-active-map-work");
    }

    if (!panel) return;
    var templateKey = state ? state.type + ":" + state.id : null;
    panel.innerHTML = templateKey && templates.has(templateKey) ? templates.get(templateKey) : defaultPanel;
  }

  root.querySelectorAll("[data-hyperedge-label]").forEach(function (label) {
    var id = label.getAttribute("data-hyperedge-label");
    label.addEventListener("pointerenter", function () {
      setDirectTransient("hyperedge", id);
    });
    label.addEventListener("pointerleave", scheduleTransientClear);
    label.addEventListener("focus", function () {
      setDirectTransient("hyperedge", id);
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
      setDirectTransient("work", id);
    });
    paper.addEventListener("pointerleave", scheduleTransientClear);
    paper.addEventListener("focus", function () {
      setDirectTransient("work", id);
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

  if (canvas) {
    canvas.addEventListener("pointerenter", function () {
      canvasBounds = canvas.getBoundingClientRect();
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!canvasBounds) canvasBounds = canvas.getBoundingClientRect();
      var clientX = event.clientX;
      var clientY = event.clientY;
      var interactiveTarget = isInteractiveMapTarget(event.target);

      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pointerFrame = window.requestAnimationFrame(function () {
        if (!reducedMotion.matches) {
          var x = ((clientX - canvasBounds.left) / canvasBounds.width) * 100;
          var y = ((clientY - canvasBounds.top) / canvasBounds.height) * 100;
          canvas.style.setProperty("--map-pointer-x", Math.max(0, Math.min(100, x)) + "%");
          canvas.style.setProperty("--map-pointer-y", Math.max(0, Math.min(100, y)) + "%");
        }

        if (!interactiveTarget) updateProximity(clientX, clientY);
      });
    });

    canvas.addEventListener("pointerleave", function () {
      proximityEdgeId = null;
      transientState = null;
      canvas.classList.remove("has-edge-nearby");
      canvas.removeAttribute("data-nearest-edge");
      canvas.style.setProperty("--map-pointer-x", "50%");
      canvas.style.setProperty("--map-pointer-y", "-20%");
      renderState();
    });

    canvas.addEventListener("click", function (event) {
      if (isInteractiveMapTarget(event.target) || !proximityEdgeId) return;
      togglePinnedEdge(proximityEdgeId);
    });

    window.addEventListener("resize", function () {
      canvasBounds = null;
    }, { passive: true });
  }
})();

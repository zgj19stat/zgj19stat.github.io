(function () {
  "use strict";

  var root = document.querySelector("[data-visitor-counter]");
  if (!root) return;

  var endpoint = (root.getAttribute("data-counter-endpoint") || "").replace(/\/$/, "");
  var valueElement = root.querySelector("[data-counter-value]");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var storageKey = "zgj19stat_visit_session_v1";
  var sessionLength = 8 * 60 * 60 * 1000;
  var refreshInterval = 60 * 1000;
  var refreshTimer = null;
  var currentValue = null;

  if (!endpoint || !valueElement || typeof window.fetch !== "function") {
    root.setAttribute("data-counter-state", "unavailable");
    return;
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    var bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }

    return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  }

  function sessionId() {
    var now = Date.now();
    try {
      var stored = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (stored && stored.id && Number(stored.expiresAt) > now) return stored.id;

      var next = { id: randomId(), expiresAt: now + sessionLength };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next.id;
    } catch (error) {
      return randomId();
    }
  }

  function formatCount(value) {
    try {
      return new Intl.NumberFormat("en-US").format(value);
    } catch (error) {
      return String(value);
    }
  }

  function displayCount(nextValue) {
    var numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) return;

    var roundedValue = Math.floor(numericValue);
    var changed = currentValue !== null && roundedValue !== currentValue;
    var startValue = currentValue === null ? Math.max(0, roundedValue - 16) : currentValue;
    currentValue = roundedValue;

    if (reducedMotion.matches || startValue === roundedValue) {
      valueElement.textContent = formatCount(roundedValue);
    } else {
      var startedAt = performance.now();
      var duration = 520;
      var animate = function (now) {
        var progress = Math.min(1, (now - startedAt) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        valueElement.textContent = formatCount(Math.round(startValue + (roundedValue - startValue) * eased));
        if (progress < 1) window.requestAnimationFrame(animate);
      };
      window.requestAnimationFrame(animate);
    }

    root.setAttribute("data-counter-state", changed ? "updated" : "ready");
    if (changed) {
      window.setTimeout(function () {
        if (root.getAttribute("data-counter-state") === "updated") root.setAttribute("data-counter-state", "ready");
      }, 950);
    }
  }

  function parseResponse(response) {
    if (!response.ok) throw new Error("Counter request failed with status " + response.status);
    return response.json();
  }

  function readCount() {
    return window.fetch(endpoint + "/count", {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" }
    }).then(parseResponse).then(function (data) {
      displayCount(data.total);
    });
  }

  function recordVisit() {
    return window.fetch(endpoint + "/visit", {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ session: sessionId() })
    }).then(parseResponse).then(function (data) {
      displayCount(data.total);
    });
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      if (document.visibilityState === "visible") {
        readCount().catch(function () {});
      }
      scheduleRefresh();
    }, refreshInterval);
  }

  recordVisit().catch(function () {
    return readCount();
  }).catch(function () {
    root.setAttribute("data-counter-state", "unavailable");
  }).finally(scheduleRefresh);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") readCount().catch(function () {});
  });
})();

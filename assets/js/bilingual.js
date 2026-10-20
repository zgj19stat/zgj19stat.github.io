(function () {
  "use strict";
  var nav = document.getElementById("profile-nav");
  if (!nav) return;
  var button = nav.querySelector("button");
  function closeMenu() {
    nav.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
  }
  button.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", function (event) {
    if (!nav.contains(event.target)) closeMenu();
  });
  nav.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeMenu();
      button.focus();
    }
  });
  var languageLink = nav.querySelector("[data-language-switch]");
  var pairedPath = languageLink.getAttribute("href");
  function syncLanguageLink() {
    var view = document.querySelector("[data-map-view]");
    var timeline = view && view.getAttribute("data-map-view") === "timeline";
    languageLink.href = pairedPath + (timeline ? "?view=timeline" : "") + window.location.hash;
  }
  syncLanguageLink();
  window.addEventListener("hashchange", syncLanguageLink);
  languageLink.addEventListener("click", syncLanguageLink);
  languageLink.addEventListener("focus", syncLanguageLink);
  languageLink.addEventListener("pointerenter", syncLanguageLink);
  var map = document.querySelector("[data-map-view]");
  if (map) {
    new MutationObserver(syncLanguageLink).observe(map, { attributes: true, attributeFilter: ["data-map-view"] });
    if (new URLSearchParams(window.location.search).get("view") === "timeline") {
      var timelineButton = map.querySelector('[data-map-view-button="timeline"]');
      if (timelineButton) timelineButton.click();
    }
  }
})();

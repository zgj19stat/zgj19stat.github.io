(function () {
  "use strict";

  var root = document.querySelector("[data-academic-path]");
  if (!root || typeof Intl === "undefined") return;

  var timeZone = root.getAttribute("data-time-zone") || "Asia/Shanghai";
  var labels = {
    completed: "Completed",
    current: "Current",
    upcoming: "Upcoming"
  };

  function dateKeyInTimeZone(date) {
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(date);
      var values = {};
      parts.forEach(function (part) {
        if (part.type !== "literal") values[part.type] = part.value;
      });
      return values.year + "-" + values.month + "-" + values.day;
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function statusFor(stage, today) {
    var start = stage.getAttribute("data-start-date");
    var end = stage.getAttribute("data-end-date");
    if (start && today < start) return "upcoming";
    if (end && today > end) return "completed";
    return "current";
  }

  var today = dateKeyInTimeZone(new Date());
  root.querySelectorAll("[data-academic-stage]").forEach(function (stage) {
    var status = statusFor(stage, today);
    var previous = stage.getAttribute("data-status");
    if (previous) stage.classList.remove("academic-path__stage--" + previous);
    stage.classList.add("academic-path__stage--" + status);
    stage.setAttribute("data-status", status);

    var statusLabel = stage.querySelector("[data-academic-status]");
    if (statusLabel) statusLabel.textContent = labels[status];
  });
})();

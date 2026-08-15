/* ==========================================================================
   AbridgeAI — landing page
   Cycles the product preview's pipeline through its seven real states and
   syncs the matching "How it works" row. Purely illustrative — no data
   leaves the browser, nothing here talks to the dashboard's localStorage.
   ========================================================================== */
"use strict";

(function () {
  var STEPS = ["github", "research", "feasibility", "architecture", "stack", "builder", "task"];
  var DEMO_SCORE = 82;

  var pipelineEl = document.getElementById("l-preview-pipeline");
  var howStepsEl = document.getElementById("l-how-steps");
  var arcFillEl = document.getElementById("l-preview-arc");
  var scoreEl = document.getElementById("l-preview-score");
  var verdictEl = document.getElementById("l-preview-verdict");

  if (!pipelineEl) return;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var r = 32;
  var circumference = 2 * Math.PI * r;
  arcFillEl.style.strokeDasharray = circumference.toFixed(2);
  arcFillEl.style.strokeDashoffset = circumference.toFixed(2);

  function setFrame(index) {
    STEPS.forEach(function (step, i) {
      var row = pipelineEl.querySelector('[data-step="' + step + '"]');
      var howRow = howStepsEl.querySelector('[data-step="' + step + '"]');
      var status = row.querySelector(".tl-status");
      row.classList.remove("is-done", "is-running");
      if (howRow) howRow.classList.remove("is-active");

      if (i < index) {
        row.classList.add("is-done");
        status.textContent = "completed";
      } else if (i === index) {
        row.classList.add("is-running");
        status.textContent = "in progress";
        if (howRow) howRow.classList.add("is-active");
      } else {
        status.textContent = "queued";
      }
    });

    // Once the Feasibility step has started, fill in the arc/score/verdict —
    // a fixed illustrative number, not live data.
    var feasReached = index >= 2;
    var pct = feasReached ? DEMO_SCORE / 100 : 0;
    arcFillEl.style.strokeDashoffset = (circumference * (1 - pct)).toFixed(2);
    scoreEl.textContent = feasReached ? DEMO_SCORE : 0;
    verdictEl.textContent = feasReached ? "GO" : "Running…";
    verdictEl.setAttribute("data-verdict", "good");
  }

  if (reduceMotion) {
    setFrame(2); // a single settled frame: Feasibility running
    return;
  }

  var i = 0;
  setFrame(i);
  setInterval(function () {
    i = (i + 1) % STEPS.length;
    setFrame(i);
  }, 2400);
})();
/* ==========================================================================
   AbridgeAI — agent workspace
   Client-side agent pipeline. Everything is deterministic: the same inputs
   always produce the same outputs, so results are reproducible per project.
   ========================================================================== */
"use strict";

(function () {
  // ------------------------------------------------------------------------
  // DOM helpers
  // ------------------------------------------------------------------------
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var form = $("#project-form");
  var runBtn = $("#run-btn");
  var formHint = $("#form-hint");
  var statusEl = $("#status");
  var statusText = $("#status-text");
  var pipelineEl = $("#pipeline");
  var outputsEl = $("#outputs");
  var outputsPanel = $("#outputs-panel");
  var historyList = $("#history-list");
  var historyEmpty = $("#history-empty");
  var historyCount = $("#history-count");
  var toastEl = $("#toast");
  var pipelineState = $("#pipeline-state");

  var STEP_ORDER = ["github", "research", "architecture", "stack", "task"];

  var HISTORY_KEY = "abridgeai.history.v1";
  var running = false;

  // ------------------------------------------------------------------------
  // Small utilities
  // ------------------------------------------------------------------------
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // djb2 — stable hash so agent outputs are deterministic per input string.
  function hash(str) {
    var h = 5381;
    var s = String(str == null ? "" : str);
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  // Deterministic pick: same seed + array => same items every time.
  function pick(seed, arr, count) {
    var items = arr.slice();
    var out = [];
    var h = seed >>> 0;
    var i, idx;
    for (i = 0; i < count && items.length > 0; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      idx = h % items.length;
      out.push(items.splice(idx, 1)[0]);
    }
    return out;
  }

  function timeStamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------------------
  // GitHub parser (client-side, public API) + sample fallback
  // ------------------------------------------------------------------------
  function parseGitHubProfile(profile) {
    return {
      login: profile.login || "unknown",
      name: profile.name || profile.login || "Unknown",
      bio: profile.bio || null,
      location: profile.location || null,
      company: profile.company || null,
      blog: profile.blog || null,
      publicRepos: profile.public_repos != null ? profile.public_repos : 0,
      followers: profile.followers != null ? profile.followers : 0,
      following: profile.following != null ? profile.following : 0,
      htmlUrl: profile.html_url || null,
      createdAt: profile.created_at || null
    };
  }

  function tallyLanguages(repos) {
    var tally = {};
    (repos || []).forEach(function (repo) {
      var lang = repo.language;
      if (lang) tally[lang] = (tally[lang] || 0) + 1;
    });
    return Object.keys(tally)
      .map(function (k) { return { language: k, count: tally[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function summarizeRepos(repos) {
    var sorted = (repos || []).slice().sort(function (a, b) {
      return (b.stargazers_count || 0) - (a.stargazers_count || 0);
    });
    return sorted.slice(0, 4).map(function (r) {
      return {
        name: r.name || r.full_name || "?",
        description: r.description || null,
        language: r.language || null,
        stars: r.stargazers_count != null ? r.stargazers_count : 0
      };
    });
  }

  // Try the public GitHub API; fall back to bundled sample data on any failure
  // (offline, rate limit, non-existent user, CORS).
  async function loadGitHub(username) {
    var user = String(username || "").trim().replace(/^@/, "");
    if (!user) return loadSampleGitHub();

    try {
      var profileRes = await fetch("https://api.github.com/users/" + encodeURIComponent(user));
      if (!profileRes.ok) throw new Error("GitHub profile status " + profileRes.status);
      var profile = await profileRes.json();

      var reposRes = await fetch(
        "https://api.github.com/users/" + encodeURIComponent(user) + "/repos?per_page=100&sort=updated"
      );
      var repos = reposRes.ok ? await reposRes.json() : [];

      return {
        source: "live",
        profile: parseGitHubProfile(profile),
        languages: tallyLanguages(repos),
        repos: summarizeRepos(repos)
      };
    } catch (err) {
      return loadSampleGitHub();
    }
  }

  async function loadSampleGitHub() {
    try {
      var res = await fetch("data/sample-github-analysis.json");
      if (!res.ok) throw new Error("sample fetch failed");
      var data = await res.json();
      return {
        source: "sample",
        profile: parseGitHubProfile(data.profile),
        languages: tallyLanguages(data.repos),
        repos: summarizeRepos(data.repos)
      };
    } catch (err) {
      return {
        source: "sample",
        profile: {
          login: "octocat", name: "The Octocat", bio: "Curious cat.",
          location: null, company: null, blog: null,
          publicRepos: 8, followers: 20124, following: 9,
          htmlUrl: null, createdAt: null
        },
        languages: [{ language: "TypeScript", count: 3 }, { language: "JavaScript", count: 1 }, { language: "Python", count: 1 }, { language: "Go", count: 1 }, { language: "Rust", count: 1 }],
        repos: []
      };
    }
  }

  // ------------------------------------------------------------------------
  // Deterministic agent outputs
  // ------------------------------------------------------------------------
  function githubAgentText(gh) {
    var p = gh.profile;
    var lines = [];
    lines.push(p.name + " (@" + p.login + ")");
    if (p.bio) lines.push("Bio: " + p.bio);
    var meta = [];
    if (p.location) meta.push(p.location);
    if (p.company) meta.push(p.company);
    if (p.blog) meta.push(p.blog);
    if (meta.length) lines.push("From: " + meta.join(" · "));
    lines.push("Public repos: " + p.publicRepos + "  ·  Followers: " + p.followers + "  ·  Following: " + p.following);

    var langs = gh.languages.slice(0, 3);
    if (langs.length) {
      lines.push("Top languages: " + langs.map(function (l) { return l.language + " (" + l.count + ")"; }).join(", "));
    }

    if (gh.repos.length) {
      lines.push("");
      lines.push("Featured repos:");
      gh.repos.forEach(function (r) {
        lines.push("  • " + r.name + (r.stars ? " ★" + r.stars : "") + (r.language ? " [" + r.language + "]" : ""));
        if (r.description) lines.push("    " + r.description);
      });
    }
    return lines.join("\n");
  }

  var RESEARCH_POOL = {
    opportunities: [
      "Small, focused tools with a single clear job tend to win over sprawling platforms.",
      "There is a steady market for fast, opinionated utilities that remove ceremony.",
      "Automation of recurring manual work remains underserved by most tooling.",
      "Teams pay for measurable time saved; the pitch should be concrete and numeric.",
      "The pattern of 'input → structured output' generalizes well across domains."
    ],
    risks: [
      "Feature creep is the top failure mode; scope to one sharp slice first.",
      "Existing incumbents often win on habit rather than capability.",
      "Solo-built tools struggle on support load; keep the surface area small.",
      "Integration friction with existing workflows is the most common adoption blocker.",
      "Underspecified inputs produce unreliable outputs; define inputs explicitly."
    ],
    directions: [
      "Lead with the fastest end-to-end vertical slice, then harden it.",
      "Ship a CLI first, then wrap it in a minimal web surface.",
      "Publish the deterministic core as a library so other tools can embed it.",
      "Make the pipeline observable: users should see each stage work.",
      "Design for offline-first; it removes a whole class of failure modes."
    ]
  };

  function researchAgentText(input, gh) {
    var seed = hash((input.idea || "") + "|" + input.stack);
    var opportunities = pick(seed, RESEARCH_POOL.opportunities, 3);
    var risks = pick(seed ^ 0x9e3779b9, RESEARCH_POOL.risks, 2);
    var directions = pick(seed ^ 0x85ebca6b, RESEARCH_POOL.directions, 2);

    var lines = [];
    lines.push("Project: " + input.idea);
    lines.push("Signal: " + (gh.languages.length ? gh.languages[0].language : "n/a") + "-first builder, " + gh.profile.followers + " followers on GitHub.");
    lines.push("");
    lines.push("Opportunity scan");
    opportunities.forEach(function (o, i) { lines.push((i + 1) + ". " + o); });
    lines.push("");
    lines.push("Risks to plan around");
    risks.forEach(function (r, i) { lines.push((i + 1) + ". " + r); });
    lines.push("");
    lines.push("Recommended direction");
    directions.forEach(function (d, i) { lines.push((i + 1) + ". " + d); });
    return lines.join("\n");
  }

  var MODULE_POOL = [
    "core / domain logic",
    "cli entrypoint",
    "web / api layer",
    "persistence adapter",
    "config & env handling",
    "logging & observability",
    "error taxonomy",
    "test harness / fixtures"
  ];

  function architectureAgentText(input) {
    var seed = hash((input.idea || "") + "|arch");
    var modules = pick(seed, MODULE_POOL, 4);
    var flow = pick(seed ^ 0x2545f491, [
      "input → parse → transform → output",
      "request → validate → execute → persist → respond",
      "collect → analyze → summarize → deliver",
      "watch → filter → act → report"
    ], 1)[0];

    var lines = [];
    lines.push("Shape: " + flow);
    lines.push("");
    lines.push("Modules");
    modules.forEach(function (m, i) { lines.push((i + 1) + ". " + m); });
    lines.push("");
    lines.push("Data flow");
    lines.push("  boundary → " + modules[0] + " → " + modules[1] + " → " + modules[2]);
    lines.push("");
    lines.push("Principles");
    lines.push("  • Pure core, thin shell: all logic deterministic & side-effect free.");
    lines.push("  • Adapters at the edges: swap CLI for web without touching core.");
    lines.push("  • Every module gets a unit test with fixed fixtures.");
    return lines.join("\n");
  }

  var STACKS = {
    typescript: {
      label: "TypeScript / JavaScript",
      app: "TypeScript 5 + Node 22 (or Bun)",
      ui: "React 18 + Vite",
      api: "Hono (lightweight, edge-ready)",
      data: "SQLite via better-sqlite3 (file) → Postgres when needed",
      test: "Vitest",
      lint: "Biome",
      why: "Strong typing for a deterministic pipeline, one language across CLI + web."
    },
    python: {
      label: "Python",
      app: "Python 3.12 + uv",
      ui: "Starlette + simple server-rendered templates",
      api: "FastAPI",
      data: "SQLite via stdlib sqlite3 → Postgres when needed",
      test: "pytest",
      lint: "Ruff",
      why: "Fast to iterate, rich stdlib for parsing and data work."
    },
    go: {
      label: "Go",
      app: "Go 1.22",
      ui: "net/http + static assets",
      api: "net/http stdlib (or chi)",
      data: "SQLite via modernc.org/sqlite → Postgres when needed",
      test: "go test",
      lint: "golangci-lint",
      why: "Single static binary, trivial to deploy, great for CLIs."
    },
    rust: {
      label: "Rust",
      app: "Rust 2021 edition",
      ui: "axum + serve static",
      api: "axum",
      data: "rusqlite → Postgres via sqlx when needed",
      test: "cargo test",
      lint: "clippy",
      why: "Maximum correctness for a deterministic pipeline; compile-time safety."
    },
    unsure: {
      label: "Not sure yet",
      app: "TypeScript 5 + Node 22",
      ui: "React 18 + Vite",
      api: "Hono",
      data: "SQLite via better-sqlite3",
      test: "Vitest",
      lint: "Biome",
      why: "Recommended default: one language, huge ecosystem, fastest path to a working demo."
    }
  };

  function stackAgentText(input) {
    var key = input.stack || "unsure";
    var s = STACKS[key] || STACKS.unsure;
    var comfort = input.comfort === "advanced" ? "skip guardrails, add CI + benchmarks early"
      : input.comfort === "intermediate" ? "add small tests per module, keep it boring"
      : "prefer scaffolding + step-by-step notes, one feature at a time";

    var lines = [];
    lines.push("Stack: " + s.label);
    lines.push("  app     " + s.app);
    lines.push("  ui      " + s.ui);
    lines.push("  api     " + s.api);
    lines.push("  data    " + s.data);
    lines.push("  test    " + s.test);
    lines.push("  lint    " + s.lint);
    lines.push("");
    lines.push("Why: " + s.why);
    lines.push("Pace (" + input.comfort + "): " + comfort);
    return lines.join("\n");
  }

  function taskAgentText(ctx) {
    var lines = [];
    lines.push("AO READY TASK PROMPT");
    lines.push("====================");
    lines.push("");
    lines.push("Build: " + ctx.idea);
    lines.push("For: " + (ctx.name || "the project owner"));
    lines.push("");
    lines.push("Context");
    lines.push("- GitHub: " + ctx.githubFirstLine);
    lines.push("- Stack: " + ctx.stackLabel);
    lines.push("- Architecture: " + ctx.architectureFirstLine);
    lines.push("- Research: " + ctx.researchFirstLine);
    lines.push("- Deadline: " + (ctx.deadline || "not specified") + " · Comfort: " + ctx.comfort);
    lines.push("");
    lines.push("Instructions");
    lines.push("1. Start with a short implementation plan before editing.");
    lines.push("2. Keep logic deterministic — no external AI calls.");
    lines.push("3. Structure the code as a pure core with thin adapters.");
    lines.push("4. Add a unit test for every module.");
    lines.push("5. Implement, verify locally, commit, and open a PR.");
    return lines.join("\n");
  }

  // ------------------------------------------------------------------------
  // Pipeline UI
  // ------------------------------------------------------------------------
  function setStepState(step, state) {
    var el = pipelineEl.querySelector('[data-step="' + step + '"]');
    if (!el) return;
    el.classList.remove("is-running", "is-done");
    if (state === "running") el.classList.add("is-running");
    if (state === "done") el.classList.add("is-done");
    var statusEl = el.querySelector(".pipe-status");
    statusEl.textContent = state === "running" ? "running…" : state === "done" ? "done" : "queued";
  }

  function setPipelineState(state) {
    pipelineState.textContent = state;
  }

  function setStatus(state, text) {
    statusEl.setAttribute("data-state", state);
    statusText.textContent = text;
  }

  function addOutputCard(index, title, bodyHtml, opts) {
    opts = opts || {};
    outputsPanel.hidden = false;
    var card = document.createElement("article");
    card.className = "card";
    card.setAttribute("data-agent", opts.agent || "");

    var head = document.createElement("div");
    head.className = "card-head";

    var titleEl = document.createElement("div");
    titleEl.className = "card-title";
    titleEl.innerHTML =
      '<span class="card-index">' + esc("0" + index) + "</span>" +
      "<span>" + esc(title) + "</span>";

    head.appendChild(titleEl);

    if (opts.badge) {
      var badge = document.createElement("span");
      badge.className = "card-badge";
      badge.textContent = opts.badge;
      head.appendChild(badge);
    }

    var body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = bodyHtml;

    card.appendChild(head);
    card.appendChild(body);
    outputsEl.appendChild(card);

    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return card;
  }

  function renderPromptCard(text) {
    var card = addOutputCard(5, "AO Task Agent", "", { agent: "task" });
    var body = $(".card-body", card);

    var wrap = document.createElement("div");
    wrap.className = "prompt-wrap";

    var ta = document.createElement("textarea");
    ta.id = "ao-prompt";
    ta.readOnly = true;
    ta.value = text;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "Copy prompt";
    btn.addEventListener("click", function () {
      copyText(ta.value, btn);
    });

    wrap.appendChild(ta);
    wrap.appendChild(btn);
    body.appendChild(wrap);
  }

  function copyText(text, btn) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast("Prompt copied to clipboard"); }
      catch (e) { toast("Could not copy — select the text manually."); }
      document.body.removeChild(ta);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Prompt copied to clipboard");
        if (btn) { btn.classList.add("is-copied"); setTimeout(function () { btn.classList.remove("is-copied"); }, 1400); }
      }, fallback);
    } else {
      fallback();
    }
  }

  // ------------------------------------------------------------------------
  // History (left rail)
  // ------------------------------------------------------------------------
  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) { return []; }
  }

  function writeHistory(items) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
  }

  function renderHistory(activeId) {
    var items = readHistory();
    historyList.innerHTML = "";
    historyEmpty.style.display = items.length ? "none" : "";
    historyCount.textContent = items.length;

    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "history-item" + (item.id === activeId ? " is-active" : "");
      li.innerHTML =
        '<p class="history-item-title">' + esc(item.name || item.idea || "Untitled") + "</p>" +
        '<div class="history-item-meta">' + esc(item.time || "") + "</div>";
      li.addEventListener("click", function () {
        fillForm(item);
        renderHistory(item.id);
      });
      historyList.appendChild(li);
    });
  }

  function saveHistory(input) {
    var items = readHistory();
    var now = new Date();
    var record = {
      id: Date.now().toString(36),
      name: input.name,
      stack: input.stack,
      github: input.github,
      idea: input.idea,
      deadline: input.deadline,
      comfort: input.comfort,
      time: now.toLocaleString()
    };
    items.unshift(record);
    writeHistory(items.slice(0, 12));
    renderHistory(record.id);
  }

  function fillForm(item) {
    $("#f-name").value = item.name || "";
    $("#f-stack").value = item.stack || "typescript";
    $("#f-github").value = item.github || "";
    $("#f-idea").value = item.idea || "";
    $("#f-deadline").value = item.deadline || "";
    $("#f-comfort").value = item.comfort || "beginner";
    toast("Loaded project into the form.");
  }

  function readForm() {
    return {
      name: $("#f-name").value.trim(),
      stack: $("#f-stack").value,
      github: $("#f-github").value.trim(),
      idea: $("#f-idea").value.trim(),
      deadline: $("#f-deadline").value.trim(),
      comfort: $("#f-comfort").value
    };
  }

  // ------------------------------------------------------------------------
  // Pipeline runner
  // ------------------------------------------------------------------------
  async function runPipeline(input) {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    formHint.textContent = "";
    outputsEl.innerHTML = "";
    outputsPanel.hidden = true;

    STEP_ORDER.forEach(function (step) { setStepState(step, "queued"); });
    setPipelineState("running");
    setStatus("running", "running pipeline");

    // 1 — GitHub Agent (real API with sample fallback)
    setStepState("github", "running");
    setStatus("running", "github agent…");
    var gh = await loadGitHub(input.github);
    await sleep(650);
    var ghText = githubAgentText(gh);
    addOutputCard(1, "GitHub Agent", "<pre>" + esc(ghText) + "</pre>", {
      agent: "github",
      badge: gh.source === "live" ? "live · github.com" : "sample data"
    });
    setStepState("github", "done");

    // 2 — Research Agent
    setStepState("research", "running");
    setStatus("running", "research agent…");
    await sleep(900);
    var researchText = researchAgentText(input, gh);
    addOutputCard(2, "Research Agent", "<pre>" + esc(researchText) + "</pre>", { agent: "research" });
    setStepState("research", "done");

    // 3 — Architecture Agent
    setStepState("architecture", "running");
    setStatus("running", "architecture agent…");
    await sleep(900);
    var archText = architectureAgentText(input);
    addOutputCard(3, "Architecture Agent", "<pre>" + esc(archText) + "</pre>", { agent: "architecture" });
    setStepState("architecture", "done");

    // 4 — Tech Stack Agent
    setStepState("stack", "running");
    setStatus("running", "tech stack agent…");
    await sleep(800);
    var stackText = stackAgentText(input);
    addOutputCard(4, "Tech Stack Agent", "<pre>" + esc(stackText) + "</pre>", { agent: "stack" });
    setStepState("stack", "done");

    // 5 — AO Task Agent (assembles the copyable prompt)
    setStepState("task", "running");
    setStatus("running", "assembling AO task…");
    await sleep(800);
    var ctx = {
      name: input.name,
      idea: input.idea,
      deadline: input.deadline,
      comfort: input.comfort,
      githubFirstLine: ghText.split("\n")[0],
      stackLabel: (STACKS[input.stack] || STACKS.unsure).label,
      architectureFirstLine: archText.split("\n")[0],
      researchFirstLine: researchText.split("\n")[0]
    };
    var promptText = taskAgentText(ctx);
    renderPromptCard(promptText);
    setStepState("task", "done");

    setPipelineState("complete");
    setStatus("done", "complete · " + timeStamp());

    if (input.idea) saveHistory(input);
    running = false;
    runBtn.disabled = false;
    formHint.textContent = "Pipeline complete.";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = readForm();
    if (!input.idea) {
      formHint.textContent = "Add a project idea first.";
      return;
    }
    runPipeline(input);
  });

  // History seeded empty; render whatever exists.
  renderHistory();
})();
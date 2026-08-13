/* ============================================================
   AbridgeAI — client-side abridgement engine + demo UI
   MVP approach: lightweight extractive summarization that runs
   entirely in the browser (no server, no API keys).
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- text utilities ---------------- */

  var STOPWORDS = new Set((
    "a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves"
  ).split(/\s+/));

  /* Split text into sentences, tolerating common abbreviations. */
  function splitSentences(text) {
    var cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    // Protect decimal points and common abbreviations from splitting.
    var protect = cleaned.replace(/(\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|Fig|No|approx|Inc|Ltd)\.)/gi, function (m) {
      return m.replace(".", "\u0001");
    });
    var parts = protect
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/u)
      .map(function (s) { return s.replace(/\u0001/g, ".").trim(); })
      .filter(function (s) { return s.length > 1; });
    return parts;
  }

  function words(text) {
    var m = text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g);
    return m || [];
  }

  function contentWords(text) {
    return words(text).filter(function (w) {
      return w.length > 2 && !STOPWORDS.has(w);
    });
  }

  function countWords(text) {
    return words(text).length;
  }

  /* ---------------- scoring ---------------- */

  function scoreSentences(sentences) {
    var freq = {};
    var total = 0;
    sentences.forEach(function (s) {
      contentWords(s).forEach(function (w) {
        if (!freq[w]) freq[w] = 0;
        freq[w] += 1;
        total += 1;
      });
    });

    return sentences.map(function (s, idx) {
      var cw = contentWords(s);
      if (!cw.length) return { sentence: s, score: 0, index: idx };
      var sum = 0;
      cw.forEach(function (w) { sum += freq[w] / total; });
      // Normalize by length so long windbags do not dominate.
      var base = sum / Math.sqrt(cw.length);
      // Position bonus: first and last sentences usually carry the thesis.
      var pos = 1 + 0.45 * Math.exp(-(idx / Math.max(sentences.length - 1, 1)) * 3)
                  + 0.25 * Math.exp(-((sentences.length - 1 - idx) / Math.max(sentences.length - 1, 1)) * 5);
      return { sentence: s, score: base * pos, index: idx };
    });
  }

  function pickSentences(sentences, ratio, minSentences, maxSentences) {
    var scored = scoreSentences(sentences);
    var target = Math.max(minSentences, Math.min(Math.round(sentences.length * ratio), maxSentences));
    if (target >= sentences.length) {
      return scored.slice().sort(function (a, b) { return a.index - b.index; });
    }
    return scored
      .slice()
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, target)
      .sort(function (a, b) { return a.index - b.index; });
  }

  function keyPoints(sentences, n) {
    var scored = scoreSentences(sentences)
      .filter(function (s) { return s.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, n).map(function (s) { return s.sentence; });
  }

  /* ---------------- public API ---------------- */

  window.Abridge = {
    summarize: function (text, opts) {
      opts = opts || {};
      var format = opts.format || "paragraph";   // paragraph | bullets
      var length = opts.length || "medium";      // short | medium | long
      var keyPointsCount = opts.keyPoints || 0;

      var sentences = splitSentences(text);
      var ratioByLength = { short: 0.15, medium: 0.3, long: 0.45 };
      var picked = pickSentences(
        sentences,
        ratioByLength[length] || 0.3,
        2,
        Math.max(3, Math.round(sentences.length / 2))
      );
      var summaryText = picked.map(function (p) { return p.sentence; }).join(" ");
      var points = keyPointsCount > 0 ? keyPoints(sentences, keyPointsCount) : [];

      return {
        summary: summaryText,
        keyPoints: points,
        stats: {
          inputWords: countWords(text),
          inputChars: text.trim().length,
          inputSentences: sentences.length,
          outputWords: countWords(summaryText),
          outputChars: summaryText.length,
          outputSentences: picked.length,
          reduction: sentences.length
            ? Math.max(0, Math.round((1 - picked.length / sentences.length) * 100))
            : 0
        }
      };
    }
  };

  /* ---------------- demo UI ---------------- */

  function $(id) { return document.getElementById(id); }

  var inputEl = $("input-text");
  var lengthEl = $("opt-length");
  var formatEl = $("opt-format");
  var pointsEl = $("opt-points");
  var generateBtn = $("btn-generate");
  var sampleBtn = $("btn-sample");
  var clearBtn = $("btn-clear");
  var copyBtn = $("btn-copy");
  var downloadBtn = $("btn-download");
  var outputEl = $("output");
  var statusEl = $("demo-status");

  var SAMPLE = [
    "Remote work has permanently reshaped how modern companies operate. What began as an emergency response to a global health crisis has matured into a deliberate, long-term strategy for thousands of organizations worldwide. Employees now expect flexibility in where and when they work, and businesses that ignore this expectation increasingly struggle to attract top talent.",
    "Research consistently shows that remote and hybrid teams can be just as productive as their office-based counterparts when the right systems are in place. The key factors include clear written communication, asynchronous decision-making, and trust-based management rather than surveillance-based oversight. Teams that adopt these practices report higher engagement and lower turnover over time.",
    "However, distributed work is not without its challenges. Managers frequently cite coordination overhead, the loss of spontaneous collaboration, and the difficulty of onboarding new hires as their biggest concerns. Culture building becomes an intentional activity rather than something that happens naturally in hallways and lunchrooms.",
    "Forward-looking companies are responding with a mix of solutions. They invest in documentation, design explicit communication norms, and host periodic in-person gatherings to preserve social bonds. They also rethink metrics, measuring outcomes and impact instead of hours logged online.",
    "The evidence suggests that the future of work is hybrid by default. Organizations that design their processes around distributed realities will retain talent, reduce costs, and remain resilient. The companies that treat remote work as a temporary exception will find themselves at a growing disadvantage as the talent market continues to evolve."
  ].join(" ");

  function render(result) {
    var html = "";
    if (result.stats.outputSentences === 0) {
      outputEl.className = "output-area";
      outputEl.innerHTML = "";
      var empty = document.createElement("div");
      empty.className = "output-empty";
      empty.textContent = "Add some text and press “Abridge it” to see your summary here.";
      outputEl.appendChild(empty);
      return;
    }

    if (result.keyPoints.length) {
      html += '<p style="font-weight:700;color:var(--ink-900);margin:0 0 .4rem;">Key takeaways</p><ul class="keypoints" style="margin:0 0 1.1rem;padding-left:1.2rem;">';
      result.keyPoints.forEach(function (p) {
        html += "<li>" + escapeHtml(p) + "</li>";
      });
      html += "</ul>";
    }

    if (result.summary) {
      if (result.keyPoints.length) {
        html += '<p style="font-weight:700;color:var(--ink-900);margin:0 0 .4rem;">Abridged version</p>';
      }
      if (formatEl.value === "bullets") {
        html += '<ul class="bullet-summary" style="margin:0;padding-left:1.2rem;">';
        result.summary.split(/(?<=[.!?])\s+/u).filter(Boolean).forEach(function (s) {
          html += "<li>" + escapeHtml(s) + "</li>";
        });
        html += "</ul>";
      } else {
        html += "<p style='margin:0;'>" + escapeHtml(result.summary) + "</p>";
      }
    }

    outputEl.innerHTML = html;
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function renderStats(result) {
    var s = result.stats;
    var wordsChip = $("stat-words");
    var charsChip = $("stat-chars");
    var sentsChip = $("stat-sentences");
    var reduceChip = $("stat-reduction");

    wordsChip.textContent = s.outputWords.toLocaleString() + " / " + s.inputWords.toLocaleString();
    charsChip.textContent = s.outputChars.toLocaleString() + " / " + s.inputChars.toLocaleString();
    sentsChip.textContent = s.outputSentences.toLocaleString() + " / " + s.inputSentences.toLocaleString();
    reduceChip.textContent = s.reduction + "%";
  }

  function run() {
    var text = inputEl.value.trim();
    if (!text) {
      render({ stats: { outputSentences: 0 } });
      if (statusEl) statusEl.className = "badge ready";
      return;
    }
    var result = window.Abridge.summarize(text, {
      format: formatEl.value,
      length: lengthEl.value,
      keyPoints: parseInt(pointsEl.value, 10) || 0
    });
    render(result);
    renderStats(result);
    if (statusEl) {
      statusEl.className = "badge done";
      statusEl.textContent = "✓ Done — " + result.stats.outputSentences + " sentence" + (result.stats.outputSentences === 1 ? "" : "s") + " kept";
    }
  }

  if (generateBtn) generateBtn.addEventListener("click", run);
  if (inputEl) inputEl.addEventListener("input", function () {
    if (statusEl) {
      statusEl.className = "badge ready";
      statusEl.textContent = "● Ready";
    }
  });

  if (sampleBtn) sampleBtn.addEventListener("click", function () {
    inputEl.value = SAMPLE;
    if (statusEl) {
      statusEl.className = "badge ready";
      statusEl.textContent = "● Sample loaded — press “Abridge it”";
    }
    inputEl.focus();
  });

  if (clearBtn) clearBtn.addEventListener("click", function () {
    inputEl.value = "";
    outputEl.className = "output-area";
    outputEl.innerHTML = "";
    var chips = document.querySelectorAll(".stat-chip .k");
    var labels = [["0 / 0", "summary / original words"], ["0 / 0", "summary / original characters"], ["0 / 0", "sentences kept / total"], ["0%", "content removed"]];
    chips.forEach(function (chip, i) {
      chip.textContent = labels[i][0];
    });
    if (statusEl) { statusEl.className = "badge ready"; statusEl.textContent = "● Ready"; }
    inputEl.focus();
  });

  if (copyBtn) copyBtn.addEventListener("click", function () {
    var text = outputEl.innerText.trim();
    if (!text) { window.abridgeToast("Nothing to copy yet — generate a summary first."); return; }
    navigator.clipboard.writeText(text).then(function () {
      window.abridgeToast("Summary copied to clipboard");
    }, function () {
      // Fallback for older browsers / file contexts.
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); window.abridgeToast("Summary copied to clipboard"); }
      catch (e) { window.abridgeToast("Could not copy — select the text manually."); }
      document.body.removeChild(ta);
    });
  });

  if (downloadBtn) downloadBtn.addEventListener("click", function () {
    var text = outputEl.innerText.trim();
    if (!text) { window.abridgeToast("Nothing to download yet — generate a summary first."); return; }
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "abridgeai-summary.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    window.abridgeToast("Summary downloaded");
  });
})();
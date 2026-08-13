# AbridgeAI — Agent Workspace

A static, client-side workspace that turns a project idea into an AO-ready task prompt.
No build step, no backend, no external AI calls: every agent output is **deterministic** —
the same inputs always produce the same outputs.

## What it does

Fill in the form (name, preferred stack, GitHub username, project idea, deadline,
comfort level) and run the pipeline. Five agents run in order, visible in the rail
on the right:

1. **GitHub Agent** — fetches the public GitHub profile + repos via the public GitHub API
   (client-side). Falls back to bundled sample data (`data/sample-github-analysis.json`)
   when the API is unreachable, rate-limited, or the user doesn't exist.
2. **Research Agent** — deterministic opportunity / risk / direction scan.
3. **Architecture Agent** — deterministic module + data-flow blueprint.
4. **Tech Stack Agent** — deterministic stack recommendation from your preference.
5. **AO Task Agent** — assembles one copyable, AO-ready task prompt. The **Copy prompt**
   button writes it to your clipboard.

Completed runs are saved to the left-hand **project history** (localStorage). Clicking
an entry restores it into the form.

## Run it

Static files only — open `index.html` in any browser, or serve the folder:

```sh
# any static server works, e.g.
python -m http.server 8000
# then open http://localhost:8000
```

## Layout

- **Left rail** — empty project history (populates after runs).
- **Center** — form + generated outputs.
- **Right rail** — live agent pipeline (status per agent).

Style: warm off-white background, near-black text, one lime accent, hairline borders.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Workspace shell (history / form / pipeline). |
| `styles.css` | Design system. |
| `script.js` | GitHub parser, deterministic agents, pipeline runner, history, copy. |
| `data/sample-github-analysis.json` | Fallback GitHub profile + repos when the API is unavailable. |

## Notes

- GitHub API usage is unauthenticated (60 req/hr/IP). On failure the pipeline
  transparently falls back to sample data and labels the card accordingly.
- Determinism is guaranteed by hashing inputs (djb2) before selecting from fixed
  knowledge pools — no randomness anywhere in the pipeline.
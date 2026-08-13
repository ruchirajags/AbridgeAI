# Contributing to AbridgeAI

Thanks for helping improve AbridgeAI! This project is a plain static site — no build
step, no dependencies, no framework. Keep it that way.

## Getting started

1. Clone the repo and open `index.html` in a browser, or serve the folder:

   ```sh
   python -m http.server 8000
   # http://localhost:8000
   ```

2. Make your change in the relevant file:
   - `index.html` — page structure / markup
   - `styles.css` — design system / styling
   - `script.js` — behavior (agents, pipeline, history, clipboard, scaffold)

## Ground rules

- **No build step.** Don't add a bundler, framework, or `package.json` to render the site.
- **Keep it deterministic.** The agent outputs are stable by design (input hashing +
  fixed knowledge pools). Don't introduce randomness or external AI calls into the
  pipeline.
- **Guard against XSS.** Any user-provided text that lands in the DOM goes through
  `esc()` / `textContent` — keep it that way.
- **Match the existing style** — warm off-white background, near-black text, one lime
  accent, hairline borders.

## Checking your work

- Open the page and run the pipeline end to end (submit a project idea).
- Confirm the GitHub Agent falls back to "sample data" when offline, and that the
  **Copy prompt** button works.
- Confirm the **Download scaffold (.zip)** button produces a zip you can open, and that
  the Feasibility Agent's score/verdict update with the form inputs.
- If you changed JS, verify the file parses, e.g. `node --check script.js`.

## Submitting a PR

1. Create a branch: `git checkout -b your-feature-branch`.
2. Make focused commits with clear messages (conventional style, e.g.
   `feat:`, `fix:`, `docs:`).
3. Push and open a pull request against `main` with a short summary of the change
   and anything a reviewer should test manually.

## Code of conduct

Be respectful and constructive. Keep review feedback specific and actionable.
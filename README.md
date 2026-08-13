# AbridgeAI

**Long content. Sharp summaries.**

AbridgeAI is a static MVP for an AI text-abridgement product: paste long articles,
documents, meeting notes, or research, and get a clear, accurate summary in seconds.

This MVP is **fully static** — pure HTML, CSS, and vanilla JavaScript with no build
step, no dependencies, and no backend. The abridgement engine runs entirely in the
browser, so content never leaves the device.

## Pages

| Page | Path | Purpose |
|---|---|---|
| Landing page | `index.html` | Hero, features, how it works, pricing teaser, testimonials, FAQ |
| Live demo | `demo.html` | Working in-browser abridgement demo |
| Pricing | `pricing.html` | Plans and feature comparison table |
| About | `about.html` | Mission, how it works, roadmap, contact |

## Running it

Because the site is static, just open `index.html` in a browser, or serve the folder
with any static file server:

```bash
# Python
python -m http.server 8080

# npx (only if you already use Node)
npx serve .
```

Then visit `http://localhost:8080`.

No `npm install`, no build step, no API keys.

## How the demo abridgement works

`js/demo.js` implements a lightweight **extractive summarization** algorithm:

1. Split input into sentences.
2. Score each sentence by the frequency of its important keywords (stop words removed).
3. Apply a small position bonus so opening and closing sentences are considered.
4. Keep the top-scoring sentences in their original order to form the summary.

Because the output is extracted from the source text, every word is faithful to the
original — the algorithm never invents facts.

Options in the demo: summary length (short / medium / long), output format
(paragraph / bullets), and optional key takeaways.

## File structure

```
├── index.html          Landing page
├── demo.html           Interactive demo
├── pricing.html        Pricing plans & comparison
├── about.html          About, roadmap, contact
├── css/styles.css      Shared design system
├── js/main.js          Shared nav/FAQ/toast behavior
├── js/demo.js          Abridgement engine + demo UI
└── assets/favicon.svg  Logo / favicon
```

## Roadmap (static MVP scope)

- [x] In-browser extractive abridgement demo
- [x] Landing, pricing, and about pages
- [ ] Generative (paraphrasing) summaries
- [ ] URL & PDF import
- [ ] Accounts, history, and saved summaries
- [ ] PDF / DOCX export

## License

Licensed under the [Apache License 2.0](LICENSE).
# Project Guidance

- This is an independent Brazilian election-results dashboard. Do not imply affiliation with TSE or IBGE.
- Use official TSE data only; never estimate unpublished vote totals. Preserve TSE and IBGE attribution.
- Do not expose API keys or secrets to client-side code.
- Follow the semantic theme tokens and the existing React Aria patterns in the retained components.
- Before submitting changes, run `npm run typecheck` and `npm run build`.
- See `README.md` for setup, data sources, endpoints, and contribution details.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

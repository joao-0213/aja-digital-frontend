# Repository Guidelines

## Project Structure & Module Organization

AJA Digital is a Portuguese-language educational demo built with Next.js 16 App Router, React 19, strict TypeScript, and Tailwind CSS 4.

- `src/app/`: route entry points, global styles, layouts, and loading/error states.
- `src/features/<domain>/`: domain modules, with screens in `components/`, domain hooks in `hooks/`, and an explicit public entry in `index.ts`.
- `src/components/ui/`: generic controls, one responsibility per file; `shared/` contains generic compositions and `layout/` contains the application shell.
- `src/components/providers.tsx`: application composition. `src/providers/` owns the shared context and browser demo state; generic notifications live in `components/shared/`.
- `src/models/`, `src/mocks/`, `src/hooks/`, and `src/lib/`: types, simulated data/transport, hooks, and pure rules/utilities.
- `tests/`: domain and mock-transport tests. `public/`: static assets, including the favicon.

Keep route files thin and reusable UI independent of mock transport.

Shared data models are grouped by domain in `src/models/`; `index.ts` exposes explicit type-only exports. Keep existing `@/models` consumer imports stable, and use direct `import type` dependencies between model files. `database.ts` composes the complete demo data contract.

Read `ARQUITETURA.md` for the domain map and dependency rules before changing structure. Routes compose public feature entries. Inside a feature, use direct internal imports; across features, use `@/features/<domain>` rather than private files. UI elements never import features, application state, routes, or mocks. Keep generic UI imports within `ui/` direct to avoid barrel cycles. Features consume `useApp` from `@/providers/app-context`; only the root layout composes `Providers`.

Preserve browser persistence keys, formats, notification messages, mock delays, query-string routes and Suspense boundaries. This is a static export: browser state and mock mutations remain client-side. Do not introduce Server Actions or a runtime backend during structural refactors.

## Build, Test, and Development Commands

Use Node.js 22.6+ and npm. On Windows PowerShell, use `npm.cmd` if script execution blocks `npm`.

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: start development at `http://127.0.0.1:3000`.
- `npm test`: run the domain and API test files.
- `npm run typecheck`: check TypeScript without emitting JavaScript.
- `npm run check:architecture`: validate internal imports, dependency boundaries, and static import cycles.
- `npm run build`: generate the static site in `out/`.

Serve `out/` with a static HTTP server; this export configuration does not use `next start`. Preserve query-string detail routes such as `/disciplinas/detalhes?id=s1`.

## Coding Style & Naming Conventions

Follow existing two-space indentation, single-quoted TypeScript strings, and semicolons. Use PascalCase component names, camelCase functions, and kebab-case filenames such as `use-mock-query.ts`. Use `@/` imports for source modules and keep user-facing text in Portuguese. No ESLint or Prettier configuration is present; match surrounding code and run type checking.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name files `*.test.ts` and describe observable behavior in test titles. Add new test files to the explicit `test` script list. Cover changed rules and failure/cancellation paths; no coverage threshold is configured. Before submitting, run tests, type checking, architecture checking, and a build. Follow `VALIDACAO.md` for browser, keyboard, and responsive checks.

Unit tests are required whenever a package changes domain rules, permissions, migrations, persistence, or state transitions. Write or update meaningful tests for successful actions, denied actions, edge cases, failures, and preservation of existing data. For shared editing, cover stale revisions, revoked access, and concurrent operations against the latest state. A UI check or documentation update does not replace these tests. Run the complete `npm test` suite and report actual results and any limits of its coverage; do not mark a package validated only because its documentation or interface was updated.

## Commit & Pull Request Guidelines

Use Git throughout every task. Start by checking `git status` and the relevant history/diffs to understand the current state. Preserve pre-existing user changes and staged files; never discard, overwrite, or include unrelated changes in a commit.

After completing and validating a change, review the diff, stage only the files or hunks belonging to the task, and create a local commit without asking for confirmation unless the user explicitly requests otherwise. For larger tasks, create focused commits for completed, validated steps. Do not commit secrets, generated build output, or local graphify artifacts. Do not push, rewrite history, or run destructive Git commands unless explicitly authorized.

Use short, imperative commit subjects, such as `Fix quiz scoring for blank answers`. Report the commit hash, validation results, and any remaining uncommitted changes at the end of the task. If checks fail, report the failure and resolve it when it belongs to the task; do not describe unverified work as validated. PRs should explain behavior changes, link relevant issues, report validation results, and include screenshots for UI changes.

## Demo Data & Security

Authentication and persistence are browser-side simulations. Use fictitious data only; never add real credentials or personal documents. Preserve clear demo labels and avoid treating role switching as authorization.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## graphify

This project uses a local knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships. The entire graphify-out/ directory is ignored by Git; graphs, reports, caches and metadata must remain local and must not be committed or force-added.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Local graphify-out/ files may change after hooks or incremental updates; these changes are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Keep graph rebuilds and hooks enabled for local use. Generated graph files are not part of commits or pull requests. If graphify-out/graph.json is absent in a fresh checkout, use normal source navigation until the graph is generated locally.

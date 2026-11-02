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

Preserve browser persistence keys and formats for the legacy version, query-string routes and Suspense boundaries. During the HTTP migration, ISSUES-FRONTEND-HTTP.md and docs/http/ take precedence for affected flows: institutional reads and writes move to the separate JSON Server under /api/v1; no artificial delays or local-success fallback. Keep the static export, with authenticated requests made in the browser. Do not introduce Server Actions or a Next.js runtime backend. Keep unmigrated flows available until their integrated replacement is validated; never dual-write or merge divergent snapshots. Existing local data must remain intact and must not be uploaded automatically.

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

## Executing backlog issues

Apply this workflow to each issue, including documentation issues. When the user requests a whole backlog, create or reuse a dedicated local branch from the current checkout. Follow dependencies and continue to the next eligible issue after closing the current one. A request for one issue authorizes that issue only. For the HTTP migration, use [ISSUES-FRONTEND-HTTP.md](ISSUES-FRONTEND-HTTP.md) for scope and final acceptance. Its migration requirements supersede the legacy demo labels, artificial delays and browser-only transport requirements for the affected flows. Keep the Next.js static export and use the separate JSON Server for the HTTP API.

Read the installed ECC guides at `skills/tdd-workflow/SKILL.md`, `skills/verification-loop/SKILL.md` and `agents/code-reviewer.md`, relative to the ECC plugin root. Resolve the installed version locally (on this workstation, `~/.codex/plugins/cache/ecc/ecc/2.2.3/`). Use this repository's actual npm scripts and test runner.

1. **Scope.** Record the starting Git revision, acceptance criteria and affected entry points. Follow the Graphify rules below. For App Router routes, screens, components, hooks, providers or data-access boundaries, read and apply [arquiteto-nextjs](.agents/skills/arquiteto-nextjs/SKILL.md) and the relevant installed Next.js guide. Check feature boundaries, route composition and which code must run in the browser.
2. **Implement with ECC TDD.** For each behavior change, write a focused regression or contract test and confirm that it fails for the expected reason (RED). Record the command, test name and observed failure in the issue's validation notes. Implement the change, rerun the same test, record the passing result (GREEN), then refactor while keeping it green. Keep the failing test in the working tree until the implementation is ready for review. For documentation-only issues, check the claims, links and commands against the repository.
3. **Validate with the ECC verification loop.** Run `npm test`, `npm run typecheck`, `npm run check:architecture` and `npm run build`. Report the default build and any Webpack fallback separately. Also exercise the changed entry point: send real requests to the running API for endpoints or use a browser for UI changes, including reload and a relevant failure. For permissions or shared edits, use two independent sessions to check denied access, revocation or stale revisions as applicable.
4. **Get independent code review.** Before closing each issue, delegate a read-only review to a subagent that did not implement it. Require the ECC `code-reviewer` guide. Supply the issue, starting revision, acceptance criteria, applicable architecture guidance and the Graphify query-before-source rule. Have the reviewer inspect the entire issue diff, including new files and intermediate commits, and check contracts, regressions and test gaps. Request file/line, impact and evidence for each finding.
5. **Resolve and revalidate.** Reproduce confirmed defects, add regression coverage where applicable, fix them and rerun affected checks. Have the independent reviewer check the final diff after fixes. Document the reason for any dismissed finding. If a required check or independent review cannot run, record the blocker and leave the issue open.
6. **Close and resume.** Record the review outcome, actual validation results and any coverage limits in the backlog. Mark only verified criteria. Commit the reviewed changes under the guidelines below. Resume interrupted work from the backlog, Git history and working tree. At handoff, report commits by issue and outstanding work. Ask for input only when a required permission or decision prevents further authorized progress.

## Commit & Pull Request Guidelines

Use Git throughout every task. Start by checking `git status` and the relevant history/diffs to understand the current state. Preserve pre-existing user changes and staged files; never discard, overwrite, or include unrelated changes in a commit.

Create one local commit per cohesive change after review and validation. Commit the passing test together with the implementation it verifies. Keep RED/GREEN checkpoints in the validation notes. A large issue may produce several commits when each change is independently reviewable and validated. Stage only the files or hunks belonging to that change and commit without asking for confirmation unless the user explicitly requests otherwise. Do not commit secrets, generated build output, or local graphify artifacts. Do not push, rewrite history, or run destructive Git commands unless explicitly authorized.

Use Conventional Commits with a short, imperative subject in the form `type(scope): description`. Omit the scope when no domain is useful. Choose the type by the outcome: `feat` for new behavior, `fix` for a correction, `refactor` for restructuring with unchanged behavior, `docs` for documentation, and `test` for changes to tests alone. For example, `fix(attempts): prevent duplicate quiz submissions` includes the regression test. For tracked issues, add the issue ID in a footer such as `Refs: AJA-11`.

Report the commit hashes, validation results, and any remaining uncommitted changes at the end of the task. If checks fail, report the failure and resolve it when it belongs to the task; do not describe unverified work as validated. PRs should explain behavior changes, link relevant issues, report validation results, and include screenshots for UI changes.

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

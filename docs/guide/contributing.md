---
title: Contributing
description: Set up the repository, run the checks, follow the commit convention, and open a pull request.
---

# Contributing

Issues and pull requests are welcome. The project is small and the review bar is high: keep changes focused, add a regression test when behavior changes, and include the command you used to verify it.

## Setup

```bash
git clone https://github.com/Simon-He95/stream-diffs.git
cd stream-diffs
pnpm install
```

The package manager version is pinned in `package.json`. Use `corepack enable` if your shell does not pick it up.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Rebuild the package on change. |
| `pnpm typecheck` | TypeScript without emit. |
| `pnpm test` | Vitest suite. |
| `pnpm build` | Build the published ESM entries and declarations. |
| `pnpm size:check` | Enforce first-party gzip budgets. |
| `pnpm example` | Run the Vite capability lab. |
| `pnpm example:build` | Build the lab as a smoke test. |
| `pnpm docs:dev` | Run this documentation site. |
| `pnpm docs:build` | Build the site and catch broken MDX or imports. |
| `pnpm benchmark` | Streaming accumulator benchmarks. |
| `pnpm release:verify` | Full pre-release gate. |

Before opening a pull request, run:

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm size:check && pnpm example:build && pnpm docs:build
```

## Commit convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
type(scope): subject
```

Examples:

```text
feat(core): expose resolved file after accept
fix(stream): hold a trailing high surrogate
docs(site): add the editing playground
test(edit): cover draft restore after remount
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Scopes are encouraged but not required. Common scopes: `core`, `stream`, `diff`, `edit`, `vue`, `markstream`, `docs`, `site`, `examples`, `ci`, `deps`.

A local `commit-msg` hook checks the header with commitlint. The same rule runs on pull requests.

Rules:

- Subject in the imperative mood, lower case, no trailing period.
- Keep the header under 100 characters.
- Use the body to explain why and note behavior changes.
- Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.

## Tests

- DOM and controller behavior belongs in `test/`.
- Renderer integration tests use jsdom and the real Diffs package.
- Keep tests deterministic. Do not assert exact highlight timings.
- For a visual change, add the smallest scenario that proves the behavior and include a screenshot in the pull request if layout moved.

## Documentation changes

- Docs live in `docs/`. The site is VitePress.
- Interactive components live in `docs/.vitepress/theme/components/`.
- New public API should be added to [API reference](/api) and to a guide page.
- Keep claims verifiable. If a feature is not implemented, say so or do not document it.

## Pull requests

- One logical change per pull request.
- Link the issue or describe the user problem.
- Include before and after behavior for visual changes.
- Update docs when public behavior changes.
- Do not commit generated `dist/`, `.vitepress/dist`, or cache directories.

Use the pull request template in `.github/`.

## Release

Releases use `bumpp`:

```bash
pnpm release
```

The command builds, runs the publish path, and bumps the version. Maintainers run it from `main` after the verification workflow is green.

## Code style

- TypeScript, ESM, no semicolons.
- Prefer narrow public surfaces over exposing upstream internals.
- Comments explain why, not what.
- Keep the root entry free of eager renderer imports.
- Do not add dependencies to the root runtime without a measured reason.

## Security

Do not open a public issue for a vulnerability. Follow [SECURITY.md](https://github.com/Simon-He95/stream-diffs/blob/main/SECURITY.md).

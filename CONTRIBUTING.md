# Contributing to stream-diffs

Thanks for taking the time to improve the project. This repository favors small, focused changes with a test or a reproducible example.

## Setup

```bash
git clone https://github.com/Simon-He95/stream-diffs.git
cd stream-diffs
pnpm install
```

`pnpm` is pinned in `package.json`. Run `corepack enable` if your shell does not resolve the pinned version.

The install step configures a local `commit-msg` hook with commitlint.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Public controllers, types, Vue wrappers, markstream compatibility. |
| `test/` | Vitest and jsdom coverage, including real renderer integration. |
| `examples/` | Standalone Vite capability lab. |
| `docs/` | VitePress site, guides, and interactive components. |
| `scripts/` | Package size and release checks. |
| `benchmarks/` | Streaming accumulator benchmarks. |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | TypeScript without emit. |
| `pnpm test` | Vitest suite. |
| `pnpm build` | Build ESM entries and declarations. |
| `pnpm size:check` | Enforce first-party gzip budgets. |
| `pnpm example` | Run the Vite capability lab. |
| `pnpm example:build` | Build the lab as a smoke test. |
| `pnpm docs:dev` | Run the documentation site. |
| `pnpm docs:build` | Build the documentation site. |
| `pnpm benchmark` | Streaming accumulator benchmarks. |
| `pnpm release:verify` | Full release gate. |

Before opening a pull request:

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

Suggested scopes: `core`, `stream`, `diff`, `edit`, `vue`, `markstream`, `docs`, `site`, `examples`, `ci`, `deps`, `release`.

Rules:

- Subject in the imperative mood, lower case, no trailing period.
- Header under 100 characters.
- Explain why in the body.
- Use `!` and a `BREAKING CHANGE:` footer for breaking changes.

The hook runs commitlint locally. CI checks pull request commits with the same config.

## Tests

- Put controller and DOM behavior in `test/`.
- Prefer deterministic assertions. Do not assert exact highlight timings.
- For renderer changes, add the smallest scenario that proves the behavior.
- Include a screenshot for visible layout changes.

## Documentation

- Guides live in `docs/guide/`.
- API details belong in `docs/api.md` and the relevant guide.
- Interactive demos live in `docs/.vitepress/theme/components/`.
- Document only behavior that exists. Mark reserved or experimental behavior clearly.
- Every user-facing claim should be reproducible from the repository.

## Pull requests

- One logical change per pull request.
- Link the issue or explain the user problem.
- Include before and after behavior when visuals change.
- Update docs when public API or behavior changes.
- Do not commit `dist/`, `docs/.vitepress/dist`, cache folders, or editor state.

## Release

Maintainers run:

```bash
pnpm release
```

Release requires a green CI run on `main`. `bumpp` handles the version bump and publish command.

## Code style

- TypeScript, ESM, no semicolons.
- Keep the root entry free of eager renderer imports.
- Prefer narrow public APIs over leaking upstream internals.
- Comments explain why, not what.
- Add a runtime dependency only with a measured reason.

## Security

Do not open a public issue for a vulnerability. Follow [SECURITY.md](https://github.com/Simon-He95/stream-diffs/blob/main/SECURITY.md).

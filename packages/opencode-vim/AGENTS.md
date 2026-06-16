# opencode-vim AGENTS

Scope: `packages/opencode-vim/**`.

## Ownership

- This package is the fork-specific Vim TUI frontend.
- Prefer keeping fork-owned minimal-mode behavior here instead of directly editing upstream TUI files.
- Treat this package as the only fork-owned interactive frontend.

## Boundaries

- Keep upstream default TUI behavior unchanged unless a very small bridge change is unavoidable.
- Put minimal-mode entrypoints, startup defaults, and package-local UI composition here.
- If a shared helper must be added upstream, keep the upstream change thin and neutral.

## Upstream-Derived UI

- Several minimal-mode surfaces are fork-owned copies or trimmed adaptations of upstream TUI behavior rather than fresh implementations.
- Before changing compact message rendering, prompt behavior, status/footer layout, or session interaction flows, compare the fork file with the upstream counterpart and carry over any relevant upstream fixes first.
- Treat these files as upstream-derived sync checkpoints:
  - `src/routes/session.tsx`: compact session transcript, markdown/reasoning rendering, assistant footer behavior.
  - `src/component/prompt.tsx`: minimal prompt behavior and compact prompt layout.
  - `src/component/minimal-layout.tsx`: minimal status bar and prompt footer composition.
  - `src/upstream/session.ts` and `src/upstream/thread.ts`: upstream adapter boundaries to inspect first after upstream refactors.
- When a bug appears in one of those areas, do not assume the fork logic is standalone. Check whether upstream already fixed the same behavior and then re-apply the relevant part in the forked copy.

## Validation

- Run `cd packages/opencode-vim && bun test` after package logic changes.
- Run `cd packages/opencode-vim && bun typecheck` after touching types or command wiring.
- Treat repo-wide type errors outside this package as separate debt unless they block this package directly.

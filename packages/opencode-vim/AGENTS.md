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

## Validation

- Run `cd packages/opencode-vim && bun test` after package logic changes.
- Run `cd packages/opencode-vim && bun typecheck` after touching types or command wiring.
- Treat repo-wide type errors outside this package as separate debt unless they block this package directly.

---
name: git-workflow
description: Git Flow workflow for software development with mandatory user approval and verification
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: git
---

## What I do

- Manage Git Flow branching strategy (feature → develop → main)
- Enforce mandatory user approval before any merge
- Run verification checks (LSP diagnostics, build, tests) before merge
- Support multiple project types: software, firmware, documentation, web
- Provide standardized merge workflows with clear communication templates

## Core Rules

### NEVER Auto-Merge (CRITICAL)

**NEVER merge to develop/main without explicit user permission.**

Before any merge operation, ALWAYS ask:
> "Feature complete. Do you approve merging to develop/main? (yes/no/test first)"

### Feature Branch Only

- Create feature branches from develop/main
- Never commit directly to primary branches
- Branch naming: `feature/description`, `fix/description`, `hotfix/description`

### Verification Before Merge

Before requesting merge approval, verify:
1. Feature implementation complete
2. All changes committed to feature branch
3. Code self-reviewed
4. LSP diagnostics checked (no new errors for code projects)
5. Build verification passed (if applicable)
6. Documentation updated if needed
7. Tests added/updated for new functionality

### User Approval Workflow

1. Complete feature implementation in feature branch
2. Run verification checks (LSP diagnostics, build, tests)
3. Notify user with status and options:
   - **Test it** - Run verification checks / Request manual test
   - **Approve merge** - Merge to target branch (requires verification to pass)
   - **Request changes** - Make adjustments
   - **Do not merge** - Keep in feature branch
4. **WAIT** for user response
5. If "Test it" → Perform verification, if tests fail → Fix issues, go back to step 3
6. If "Approve merge" → Merge to target branch
7. If "Do not merge" → Stop, await further instruction

## Project Type Adaptation

### Software Projects
- Verification: LSP diagnostics, Build check, Unit tests
- Documentation: Code comments, README updates, API docs

### Firmware Projects
- Verification: LSP diagnostics, Compilation check, Hardware test
- Documentation: Code comments, Hardware specs, Pin mappings

### Documentation Projects
- Verification: Markdown linting, Link checking, Formatting
- Documentation: Self-verification, Cross-references

### Web Projects
- Verification: LSP diagnostics, Build check, E2E tests
- Documentation: README, API docs, Deployment guides

## Merge Command Template

```bash
git checkout {target_branch} && git merge --no-ff {branch_name} -m "Merge {branch_name}: {description}"
```

### Target Branches
- `develop` - For ongoing development work (Git Flow)
- `main` - For production-ready changes (GitHub Flow / trunk-based)
- `master` - Legacy main branch name

## Communication Templates

### Feature Ready

```
Feature [{feature_name}] is complete on branch [{branch_name}].

Summary:
- {key_changes}

Verification Status:
- [ ] Code quality: {status}
- [ ] Build/Tests: {status}
- [ ] Documentation: {status}

Next steps:
1. Review code: git diff {base_branch}...{branch_name}
2. Choose action:
   • 'Test it' - I'll run verification checks / Request manual test
   • 'Approve merge' - Merge to {base_branch} (requires verification to pass)
   • 'Request changes' - I'll make adjustments
   • 'Do not merge' - Keep in feature branch

Awaiting your instruction.
```

### Test Results

```
Verification Results for [{branch_name}]:

Code Quality: {PASS/FAIL}
Build Status: {PASS/FAIL/N/A}
Tests: {PASS/FAIL/N/A}

Manual Test (if performed):
{user_feedback}

Ready for merge approval?
```

### Merge Complete

```
Successfully merged [{branch_name}] to {target_branch}.

Commit: {commit_hash}
Message: {commit_message}

Summary:
{changes_summary}
```

## Error Handling

### Accidental Merge Prevention
- Double-check user intent before executing merge command
- If merged without permission: Immediately notify user, offer to revert

### Test Failure
- Stop merge process, fix issues, re-request approval
- Communication: "Verification failed: {failure_details}. Issues fixed. Please re-verify."

### Build Failure
- Fix build errors before requesting merge
- Cannot request merge with build errors

## Reminders

- When user asks to implement a feature: Create feature branch, do NOT merge automatically
- When feature is complete: Ask user for approval, do NOT assume approval
- When user says "test it": Run verification checks first, then request manual test if needed
- When user says "do not merge": Respect immediately, do not argue
- When user says "merge approved": Verify all checks passed before executing merge
- After merge: Notify user with commit details and summary
- Always check for the appropriate target branch (develop vs main) based on project structure

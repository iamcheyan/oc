---
name: git-master
description: Git expert combining commit architecture, rebase operations, and history archaeology for any Git-based project
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: git
---

## What I do

- **Commit Architect**: Create atomic commits, detect commit styles, order by dependencies
- **Rebase Surgeon**: Rewrite history, resolve conflicts, squash/fixup commits
- **History Archaeologist**: Find when/where changes were introduced using pickaxe, blame, bisect

## Mode Detection

Analyze the user's request to determine operation mode:

| User Request Pattern | Mode |
|---------------------|------|
| "commit", "changes to commit" | COMMIT |
| "rebase", "squash", "cleanup history" | REBASE |
| "find when", "who changed", "git blame", "bisect" | HISTORY_SEARCH |
| "smart rebase", "rebase onto" | REBASE |

---

## COMMIT MODE

### Core Principle: Multiple Commits by Default

**ONE COMMIT = AUTOMATIC FAILURE**

| Files Changed | Minimum Commits |
|---------------|-----------------|
| 3+ files | 2+ commits |
| 5+ files | 3+ commits |
| 10+ files | 5+ commits |

### Split Criteria

Split commits when:
- Different directories/modules → SPLIT
- Different component types (model/service/view) → SPLIT
- Can be reverted independently → SPLIT
- Different concerns (UI/logic/config/test) → SPLIT
- New file vs modification → SPLIT

### Style Detection (MANDATORY)

Before making commits, analyze `git log -30` to detect:

**Language**: Count Korean vs English commits, use majority.

**Style Types**:

| Style | Pattern | Example |
|-------|---------|---------|
| SEMANTIC | `type: message` | `feat: add login` |
| PLAIN | Just description | `Add login feature` |
| SENTENCE | Full sentence | `Implemented the new login flow` |
| SHORT | Minimal keywords | `format`, `lint` |

Detection: If 50%+ match semantic pattern (`^(feat|fix|chore|refactor|docs|test|ci|style|perf|build)(\(.+\))?:`), use SEMANTIC. Otherwise use majority style.

**MANDATORY OUTPUT before committing:**
```
STYLE DETECTION RESULT
======================
Analyzed: 30 commits from git log

Language: [KOREAN | ENGLISH]
Style: [SEMANTIC | PLAIN | SENTENCE | SHORT]

Reference examples from repo:
  1. "actual commit message from log"
  2. "actual commit message from log"
  3. "actual commit message from log"

All commits will follow: [LANGUAGE] + [STYLE]
```

### Implementation + Test Pairing (MANDATORY)

Test files MUST be in the same commit as implementation:

| Test Pattern | Implementation Pattern |
|--------------|----------------------|
| `test_*.py` | `*.py` |
| `*_test.py` | `*.py` |
| `*.test.ts` | `*.ts` |
| `*.spec.ts` | `*.ts` |
| `__tests__/*.ts` | `*.ts` |
| `tests/*.py` | `src/*.py` |

### Dependency Ordering

Commit in this order:
- Level 0: Utilities, constants, type definitions
- Level 1: Models, schemas, interfaces
- Level 2: Services, business logic
- Level 3: API endpoints, controllers
- Level 4: Configuration, infrastructure

### Commit Plan (MANDATORY OUTPUT)

Before executing commits, output:
```
COMMIT PLAN
===========
Files changed: N
Minimum commits required: M
Planned commits: K
Status: K >= M (PASS) | K < M (FAIL - must split more)

COMMIT 1: [message in detected style]
  - path/to/file1
  Justification: [why these files MUST be together]

COMMIT 2: [message in detected style]
  - path/to/file2
  Justification: [why these files MUST be together]
```

### Anti-Patterns (AUTOMATIC FAILURE)

- NEVER make one giant commit (3+ files → 2+ commits)
- NEVER default to semantic commits — detect from git log first
- NEVER separate test from implementation — same commit always
- NEVER group by file type — group by feature/module
- NEVER rewrite pushed history without explicit permission
- NEVER leave working directory dirty — complete all changes
- NEVER skip JUSTIFICATION — explain why files are grouped
- NEVER use vague grouping reasons — "related to X" is NOT valid

---

## REBASE MODE

### Rebase Strategies

| User Request | Strategy |
|--------------|----------|
| "squash commits" / "cleanup" | INTERACTIVE_SQUASH |
| "rebase on main" / "update branch" | REBASE_ONTO_BASE |
| "autosquash" / "apply fixups" | AUTOSQUASH |
| "reorder commits" | INTERACTIVE_REORDER |
| "split commit" | INTERACTIVE_EDIT |

### Safety Rules

- **NEVER** rebase main/master
- Always stash dirty working directory first
- Use `--force-with-lease` instead of `--force`
- Check if commits are local-only before aggressive rewrite

### Autosquash Workflow

```bash
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash $MERGE_BASE
```

### Conflict Resolution

1. Identify conflicting files: `git status | grep "both modified"`
2. For each conflict: Read the file, understand both versions (HEAD vs incoming)
3. Resolve by editing file, remove conflict markers (`<<<<`, `====`, `>>>>`)
4. Stage resolved files: `git add <resolved-file>`
5. Continue rebase: `git rebase --continue`
6. If stuck or confused: `git rebase --abort` (safe rollback)

### Recovery Procedures

| Situation | Command |
|-----------|---------|
| Rebase going wrong | `git rebase --abort` |
| Need original commits | `git reflog` → `git reset --hard <hash>` |
| Lost commits after rebase | `git fsck --lost-found` |

---

## HISTORY SEARCH MODE

### Search Types

| User Request | Tool | Command |
|--------------|------|---------|
| "when was X added" | PICKAXE | `git log -S "X" --oneline` |
| "find commits changing X pattern" | REGEX | `git log -G "pattern" --oneline` |
| "who wrote this line" | BLAME | `git blame -L N,N file` |
| "when did bug start" | BISECT | `git bisect start` |
| "history of file" | FILE_LOG | `git log --follow -- path/file` |

### -S vs -G Difference

- `-S "foo"`: Finds commits where COUNT of "foo" changed → Use for "when was X added/removed"
- `-G "foo"`: Finds commits where DIFF contains "foo" → Use for "what commits touched lines containing X"

### Git Bisect Workflow

```bash
git bisect start
git bisect bad              # Mark current (has bug)
git bisect good v1.0.0      # Mark known good
# Git checks middle commit. Test it, then:
git bisect good   # if OK
git bisect bad    # if bug exists
# Repeat until git finds the culprit
git bisect reset  # Return to original state
```

### Present Results

```
SEARCH QUERY: "<what user asked>"
SEARCH TYPE: <PICKAXE | REGEX | BLAME | BISECT | FILE_LOG>
COMMAND USED: git log -S "..." ...

RESULTS:
  Commit       Date           Message
  ---------    ----------     --------------------------------
  abc1234      2024-06-15     feat: add discount calculation

MOST RELEVANT COMMIT: abc1234
DETAILS:
  Author: John Doe <john@example.com>
  Date: 2024-06-15
  Files changed: 3
```

---

## Universal Rules

### Supported Workflows

- Git Flow (feature → develop → main)
- GitHub Flow (feature → main)
- Trunk-based Development
- Forking Workflow
- Any custom workflow

### Reminders

- ALWAYS detect commit style from repository history before making commits
- ALWAYS create multiple atomic commits instead of one giant commit
- ALWAYS pair test files with their implementation in the same commit
- ALWAYS justify file groupings with specific, concrete reasons
- ALWAYS check branch state before aggressive history rewrites
- NEVER assume semantic commits — detect actual style first
- NEVER rebase shared/pushed branches without coordination

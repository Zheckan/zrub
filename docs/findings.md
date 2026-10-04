# Findings Guide

The `## Findings` section in `AGENTS.md` records what agents and humans learn
about this repository while working in it. This guide defines what belongs
there.

## What a finding is

- Concise and verified: run the command or read the file that proves it before
  recording it. Do not record speculation.
- Project-wide: it surprises anyone working anywhere in the repository, not
  just one file or one function.
- Non-obvious: a constraint or behavior that is invisible from the code that
  enforces it.

Good candidates: a recurring source of confusion, a tool behavior that
contradicts its documentation, a hidden coupling, a fragile convention.

## What does not belong

- A work log. Record outcomes and durable facts, not the steps taken to
  discover them.
- Secrets, tokens, or credentials of any kind.
- Findings that are already enforced by code, tests, or CI: the enforcement is
  the documentation.
- Anything stated in `AGENTS.md` itself: do not duplicate the instructions.

## Maintenance

- Correct or remove a finding as soon as it stops being true. A stale finding
  is worse than a missing one.
- Keep each finding short enough that the next reader can act on it without
  asking how.

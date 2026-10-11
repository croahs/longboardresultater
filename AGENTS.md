# Agent guidance

Setup, data pipeline and how to run the site: see [README.md](README.md).

## Delegation

The main session is the expensive model. Keep it for what needs it: understanding the
ask, design, diagnosis, review and integration. Delegate the rest to a cheaper Opus
agent whenever the work is bounded and reviewable without the expensive model:

- Implementing a design that is already decided, including the edits across files.
- Mechanical changes: renames, wording swaps, moving code, applying a review's findings.
- Regenerating data and running checks (`sitedata.py`, `pnpm typecheck`, `pnpm build`).
- Reading across many files to answer a narrow question.

Brief the agent with the goal, the files, what done looks like, and the repo rules it
must follow (pnpm, English in code and docs). Its report is a claim: verify the result
on the surface Peder will judge before calling it done. In Claude Code this is the Agent
tool with `model: "opus"`; in Codex, the cheaper model lane.

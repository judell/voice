# Before

The voice transcriber MVP is committed, but Bram's durable history files under
`resources/` are still untracked. That leaves the project history in the working
copy only.

`resources/` also contains runtime-only files such as the active port, worklist
authorization/result handoff files, and trace logs. Those should remain local
because they are machine/session state rather than project history.

# After

Track the durable Bram worklist history in the repository:

- `resources/worklist.json`
- `resources/worklist-drafts/`
- `resources/worklist-history/`
- `resources/feedback-history/`

Add a repo `.gitignore` that ignores only volatile Bram runtime artifacts:

- `resources/.bram-port`
- `resources/.bram-port.json`
- `resources/.worklist-authorization.json`
- `resources/.worklist-intent.json`
- `resources/.worklist-result.json`
- `resources/bram-traces/`
- `resources/feedback-drafts/`

This keeps the audit/history trail commit-ready while avoiding local IPC,
ports, temporary feedback drafts, and logs.

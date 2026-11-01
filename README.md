# Agent toolbox

Plugins for coding agents, aimed at long sessions: spending less on context and
keeping the work on track. The repository is a plugin marketplace. Add it once,
then install only the plugins you want.

| Plugin | What it does | Claude Code | GitHub Copilot | Codex |
| --- | --- | --- | --- | --- |
| [session-controls](plugins/session-controls) | Gives Claude controls over its own session, starting with compacting at a checkpoint it chooses | ✅ | — | — |

Each harness reads its own marketplace file in this repository, so plugins for
GitHub Copilot and Codex can be added beside the Claude Code ones.

## session-controls

Controls over its own session that otherwise only you have, given to Claude as
tools. The first is compaction at a checkpoint.

### Compacting at a checkpoint

A long session pays to re-read its whole conversation on every request. Claude
Code compacts on its own only when the context is nearly full, and otherwise
waits for you to type `/compact`. The plugin gives Claude a tool,
`compact_at_checkpoint`, so it can compact at a natural checkpoint it chooses.
The tool takes an optional `instructions` string for what the summary must keep.

The plugin's `session-controls` skill teaches when compaction pays: the
conversation is large, much work is still to come, and the next step needs
little of what came before. Compacting costs a pass over the whole conversation,
plus whatever is re-read afterwards. So the skill warns against writing long
notes just to compact and then reading them all back, which costs what the
compaction saved.

Calling the tool compacts nothing during the turn. The plugin records the
request, and a moment after the turn ends with an answer it queues `/compact`
with the instructions. The session runs it once it is idle. A turn you interrupt,
or one that fails, cancels the request. If the session cannot queue the
compaction, a toast says so and the conversation stays as it was. A subagent
cannot call the tool.

It queues the `/compact` command instead of calling `$.session.compact()`. That
call rejects while a turn runs, and is not available at all in a headless or SDK
session, such as the Claude desktop app's Code tab. The command works in both.

### Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install session-controls --marketplace miriver/agent-toolbox
```

Answer `y` to add the marketplace, then choose a scope: user scope gives every
session the tool.

From a shell:

```sh
claude plugin install session-controls --marketplace miriver/agent-toolbox
```

In the Claude desktop app, where `/plugin` does not run: click + next to the
prompt box, then Plugins, Add marketplace with `miriver/agent-toolbox`, then Add
plugin.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout, the checks and how
versions change.

## License

[MIT](LICENSE)

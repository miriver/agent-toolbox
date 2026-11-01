# Contributing

## Layout

Each plugin lives in `plugins/<name>/`. Parts every harness shares sit beside the
manifests and parts only one harness runs:

```
.claude-plugin/marketplace.json     Claude Code marketplace
.github/plugin/marketplace.json     GitHub Copilot marketplace (with its first plugin)
.agents/plugins/marketplace.json    Codex marketplace (with its first plugin)
plugins/<name>/
  skills/<skill>/SKILL.md           skills, shared by every harness
  .claude-plugin/plugin.json        Claude Code manifest
  plugin.json                       GitHub Copilot manifest (Agent Plugins)
  .codex-plugin/plugin.json         Codex manifest
  hooks/                            a Claude Code mod's hooks module
```

- A plugin ships the manifest of each harness it works in, and no others. Never
  add an empty or untested manifest.
- List each plugin in the marketplace file of every harness it ships for. Its
  folder, its `name` and its marketplace entries share one name.
- Keep the README's table accurate: one column per harness.
- Before adding the first Copilot or Codex plugin, check the manifest and
  marketplace paths against that harness's current documentation.

## Versions

A change to a plugin's files raises its `version` in each of its manifests and
marketplace entries, all equal: patch for fixes, minor for additions, major for
breaking changes. Documentation outside `plugins/` needs no version change.

## Checks

For a Claude Code plugin, from the repository root:

```sh
claude plugin validate --strict .
claude plugin validate --strict plugins/<name>
claude plugin test plugins/<name>
```

Type-check a mod with `tsc -p plugins/<name>` once Claude Code has loaded it
from its folder (`claude --plugin-dir plugins/<name>`). Loading it lays its type
declarations in `.claude-plugin/types/`, which git ignores.

Write each plugin's behaviour as a Gherkin spec in `docs/specs/<name>.feature`,
and change it with the plugin.

## Shipped content

Plugins must not depend on a personal path, a secret, a development checkout or
an unpublished artifact.

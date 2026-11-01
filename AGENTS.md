# AGENTS.md

This repository is a plugin marketplace for coding agents (Claude Code now;
GitHub Copilot and Codex later). Read [README.md](README.md) for what each plugin
does and [CONTRIBUTING.md](CONTRIBUTING.md) before changing one: it holds the
layout across harnesses, the version rule and the checks.

- Change a plugin's spec in `docs/specs/` in the same change as its behaviour.
- Raise the plugin's version in every manifest and marketplace entry that lists it.
- Keep README.md, CONTRIBUTING.md and this file accurate in the same change when
  their guidance is affected.

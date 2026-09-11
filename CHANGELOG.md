# Changelog

## 0.11.1

- Preserve Unicode quotation marks in Windows paths and CLI prompts by encoding PowerShell string data. This prevents smart quotes from being interpreted as script delimiters.
- Add Windows regressions for smart quotes, low quotes and literal script-like prompt text.
- Includes all 0.11.0 improvements: Copilot, note context, platform defaults, launch hardening and community review fixes.

## 0.11.0

- Add optional GitHub Copilot commands and current-note prompt context for supported CLI tools, with prefix, suffix and preview settings.
- Preserve literal paths and prompt arguments instead of expanding them as host shell commands. Stop launch scripts when changing directory fails.
- Restore the platform default when synced settings have no terminal for the current device.
- Support settings search on newer Obsidian versions while keeping the Obsidian 1.5.0 display fallback.
- Update official lint rules, remove legacy async transpilation helpers and fix timer compatibility.
- Check builds on Linux, macOS and Windows; attach provenance attestations to release assets. Publish only the files Obsidian installs.

The plugin still requires desktop process execution and uses temporary scripts on macOS. Those capabilities are disclosed in the README and may remain visible in automated review.

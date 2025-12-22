# Open in Terminal

A simple Obsidian plugin that adds palette commands for launching the current vault in your preferred terminal or CLI tooling.

## Features
- Always-available `Open in terminal` command that opens a new window of your configured terminal at the vault directory.
- Optional commands for Claude Code, Codex CLI, and Gemini CLI that you can enable individually — each reuses the same terminal app and runs `claude`, `codex`, or `gemini` respectively.
- Cross-platform launch strategy with clean defaults (simple launches avoid extra shell commands) and an optional logging toggle for troubleshooting.

## Commands
- **Open in terminal** – activates the configured terminal app and opens it at the vault root without running extra commands.
- **Open in Claude Code** – when enabled, opens the terminal app and runs `claude` from the vault directory.
- **Open in Codex CLI** – when enabled, opens the terminal app and runs `codex`.
- **Open in Gemini CLI** – when enabled, opens the terminal app and runs `gemini`.

## Settings
The plugin adds a settings tab under **Community Plugins → Open in Terminal** with:
- **Terminal application** – text field for the terminal app name (macOS examples: `Terminal`, `iTerm`; Windows: `cmd.exe`, `powershell`; Linux: `gnome-terminal`, `alacritty`).
- **Enable Claude Code / Codex CLI / Gemini CLI** – toggles that add the corresponding commands to the palette.
- **Enable debug logging** – optional toggle to print generated commands and platform decisions to the developer console.

Commands warn if the terminal application name is empty.

## Platform notes
- **macOS** – simple launches use `open -a <app>`; when running a CLI command, the plugin creates a temporary `.command` script that is cleaned up after launch, avoiding AppleScript permissions.
- **Windows** – uses `start` to launch `cmd.exe`, `powershell`, `wt.exe`, or other shells with the vault directory preselected; CLI commands append the respective tool invocation or fall back to `cmd.exe /K` when necessary.
- **Linux / BSD** – simple launches spawn the terminal directly with the vault as the working directory; CLI commands fall back to `<terminal> -e bash -lc 'cd "$PWD"; …'` with tweaks for GNOME Terminal and Konsole.

## Development
1. Install dependencies: `npm install`
2. Build once: `npm run build`
3. For watch mode while developing: `npm run dev`

Copy the generated `manifest.json`, `main.js`, and `styles.css` (if added) into your vault's `.obsidian/plugins/open-in-terminal/` folder to test locally.

## Release workflow
- Tag commits with the format `vX.Y.Z` to trigger the GitHub Actions release pipeline defined in `.github/workflows/release.yml`.
- The workflow installs dependencies, builds the plugin, packages `manifest.json`, `main.js`, and optional `styles.css`, and attaches them (as well as a zip archive) to the GitHub release.
- Follow Obsidian's [submission checklist](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins) before opening or updating the community plugins PR.

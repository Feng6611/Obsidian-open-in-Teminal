# Open in Terminal

A simple Obsidian plugin that adds palette commands for launching the current vault in your preferred terminal or cli tooling.

## Features
- Always-available `Open in terminal` command that opens a new window of your configured terminal at the vault directory.
- Optional commands for Claude Code, Codex cli, GitHub Copilot, Cursor cli, Gemini cli, and OpenCode that you can enable individually — each reuses the same terminal app and runs `claude`, `codex`, `copilot`, `agent`, `gemini`, or `opencode` respectively.
- Optional Git commands:
  - `Git: commit and push` runs `git add . && git commit -m "<default message>" && git push` in a newly launched terminal.
  - `Git: pull` runs `git pull` in a newly launched terminal.
  - Git commands always use the vault root as their working directory, even when note-folder launching is enabled.
- Cross-platform launch strategy with clean defaults (simple launches avoid extra shell commands).
- Optional working-directory and macOS app-instance settings.

## Commands
- **Open in terminal** – activates the configured terminal app and opens it at the vault root without running extra commands.
- **Open in Claude Code** – when enabled, opens the terminal app and runs `claude` from the vault directory.
- **Open in Codex cli** – when enabled, opens the terminal app and runs `codex`.
- **Open in GitHub Copilot** – when enabled, opens the terminal app and runs `copilot`.
- **Open in Cursor cli** – when enabled, opens the terminal app and runs `agent`.
- **Open in Gemini cli** – when enabled, opens the terminal app and runs `gemini`.
- **Open in OpenCode** – when enabled, opens the terminal app and runs `opencode`.
- **Git: commit and push** – when enabled, opens the terminal app and runs `git add . && git commit -m "<default message>" && git push`.
- **Git: pull** – when enabled, opens the terminal app and runs `git pull`.

## Settings
The plugin adds a settings tab under **Community Plugins → Open in Terminal** with:
- **Terminal application** – text field for the current platform's terminal app name (macOS examples: `Terminal`, `iTerm`; Windows: `cmd.exe`, `powershell`; Linux: `gnome-terminal`, `alacritty`). Settings are stored per platform for cross-device sync.
- **Open at current note's folder** – uses the active note's folder as the working directory; falls back to the vault root when no note is open.
- **Reuse existing terminal instance** (macOS only) – uses `open -a` by default so macOS reuses the configured terminal application. Disable it to use `open -na` and force a new application instance.
- **Enable Claude Code / Codex cli / GitHub Copilot / Cursor cli / Gemini cli / OpenCode** – toggles that add the corresponding commands to the palette.
- **Git commands**:
  - **Default commit message** – used by `Git: commit and push` (default: `update`).
  - **Enable Git: commit and push** – adds the Git commit+push command to the palette.
  - **Enable Git: pull** – adds the Git pull command to the palette.
- **Use WSL for commands** (Windows only) – run terminal and command launches inside WSL.

Commands warn if the terminal application name is empty.

## Platform notes
- **macOS** – launches use `open -a <app>` by default (or `open -na <app>` when the reuse setting is disabled); when running a cli command, the plugin creates a temporary `.command` script that is cleaned up after launch, avoiding AppleScript permissions.
- **Windows** – uses `start` to launch `cmd.exe`, `powershell`, `wt.exe`, or other shells with the vault directory preselected; cli commands append the respective tool invocation or fall back to `cmd.exe /K` when necessary.
- **Linux / BSD** – simple launches spawn the terminal directly with the vault as the working directory; cli commands fall back to `<terminal> -e bash -lc 'cd "$PWD"; …'` with tweaks for GNOME Terminal and Konsole.

## Development
1. Install dependencies: `npm install`
2. Build once: `npm run build`
3. For watch mode while developing: `npm run dev`

Copy the generated `manifest.json`, `main.js`, and `styles.css` (if added) into your vault's `.obsidian/plugins/open-in-terminal/` folder to test locally.

## Release workflow
- Tag commits with the format `X.Y.Z` to trigger the GitHub Actions release pipeline defined in `.github/workflows/release.yml`; keep the tag and manifest version in sync.
- The workflow installs dependencies, builds the plugin, packages `manifest.json`, `main.js`, and optional `styles.css`, and attaches them (as well as a zip archive) to the GitHub release.
- Follow Obsidian's [submission checklist](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins) before opening or updating the community plugins PR.

## About the author

I'm [chenfeng](https://github.com/Feng6611). Besides Obsidian plugins I
build small, permission-light Mac apps — like
[Command Reopen](https://commandreopen.com), which fixes Cmd+Tab for
minimized windows. If this plugin saves you time, you can
[buy me a coffee](https://buymeacoffee.com/kkuk).

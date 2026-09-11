# Open in Terminal

A simple Obsidian plugin that adds palette commands for launching the current vault in your preferred terminal or cli tooling.

## Features
- Always-available `Open in terminal` command that opens a new window of your configured terminal at the vault directory.
- Optional commands for Claude Code, Codex cli, GitHub Copilot, Cursor cli, Gemini cli, and OpenCode that you can enable individually — each reuses the same terminal app and runs `claude`, `codex`, `copilot`, `agent`, `gemini`, or `opencode` respectively.
- Optional Git commands:
  - `Git: commit and push` runs `git add . && git commit -m "<default message>" && git push` in a newly launched terminal.
  - `Git: pull` runs `git pull` in a newly launched terminal.
  - Git commands always use the vault root as their working directory, even when note-folder launching is enabled.
- Cross-platform launches with platform defaults and literal argument handling.
- Optional working-directory and macOS app-instance settings.

## Commands
- **Open in terminal** – activates the configured terminal app and opens it at the configured working directory.
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
- **Include current note in prompt** – off by default. When enabled, CLI sessions receive your prefix, the note path relative to the launch directory, and your suffix as one prompt. The settings show a combined preview. With no active note, the CLI starts normally. Ordinary terminal and Git commands never receive this prompt.
- **Open at current note's folder** – uses the active note's folder as the working directory; falls back to the vault root when no note is open.
- **Reuse existing terminal instance** (macOS only) – uses `open -a` by default so macOS reuses the configured terminal application. Disable it to use `open -na` and force a new application instance.
- **Enable Claude Code / Codex cli / GitHub Copilot / Cursor cli / Gemini cli / OpenCode** – toggles that add the corresponding commands to the palette.
- **Git commands**:
  - **Default commit message** – used by `Git: commit and push` (default: `update`).
  - **Enable Git: commit and push** – adds the Git commit+push command to the palette.
  - **Enable Git: pull** – adds the Git pull command to the palette.
- **Use WSL for commands** (Windows only) – run terminal and command launches inside WSL.

A blank or missing terminal setting uses the current platform default. Enter an executable path without arguments; shell command strings are not supported.

## Platform notes
- **macOS** – uses `open -a` (or `open -na` when app reuse is disabled). CLI launches use a temporary `.command` script and a login Bash shell. Terminal applications must support opening `.command` files; Terminal.app and iTerm are the primary integrations.
- **Windows** – supports CMD, Windows PowerShell, PowerShell 7, Windows Terminal and Tabby. Commands run through a temporary PowerShell script with literal arguments. Known npm shims for Claude, Codex, Gemini, Copilot and OpenCode are resolved to their Node entry point; unknown batch shims are rejected with a terminal error instead of reparsing prompts through CMD. Custom terminal-only executables are supported; unknown terminals fall back to CMD for CLI launches.
- **WSL** – supports standard drive mounts (`C:\Notes` → `/mnt/c/Notes`) and `\\wsl.localhost\Distribution\...` / `\\wsl$\Distribution\...` vaults. CLI and Git checks run in WSL. Custom drive mount layouts require a WSL UNC vault path. A Linux login Bash shell loads the distribution's CLI environment.
- **Linux / BSD** – requires Bash. GNOME Terminal uses `-- bash -lc`; other terminals use `-e bash -lc`. Terminals with different argument conventions need a wrapper executable. Directory changes are checked before any tool runs.

CLI tools must already be installed. Prompt context starts the tool's interactive mode using a positional prompt for Claude/Codex/Cursor, `--prompt-interactive` for Gemini, `--interactive` for Copilot and `--prompt` for OpenCode. The CLI may begin responding immediately. The plugin does not enable auto-approval or bypass CLI permission checks.

## Capabilities and privacy

This is a desktop-only terminal launcher. It uses Node.js process execution to open terminal applications and run the commands selected by the user. Git commit and push stages all changes under the vault root, commits them, then pushes only if the preceding steps succeed.

On macOS and Windows it writes a private temporary launch script outside the vault and removes it after launch. The Windows child process uses a process-scoped execution-policy override to load that generated script; it does not change the machine's execution policy. Paths and prompts are treated as literal arguments, not user-provided shell source. Prompt text is present in the temporary script until cleanup. The plugin itself does not send note contents over the network; the chosen CLI determines what it reads and sends.

Automated directory reviews may continue to disclose filesystem access and shell execution because these capabilities are intrinsic to this plugin. Malware-scanner availability is controlled by the directory service.

## Development

Use Node.js 22:

1. Install locked dependencies: `npm ci`
2. Run lint, type checks, regressions, build and release validation: `npm run check`
3. For watch mode: `npm run dev`

Copy `manifest.json` and the generated `main.js` into your vault's `.obsidian/plugins/open-in-terminal/` folder for a local test. See [CONTRIBUTING.md](CONTRIBUTING.md) for regression and compatibility requirements.

## Release workflow

- Keep the package, lockfile, manifest, compatibility map and changelog versions in sync.
- Tag a verified commit exactly `X.Y.Z`. The workflow installs locked dependencies and runs all checks before publishing.
- Releases include `main.js` and `manifest.json`, changelog notes and GitHub artifact attestations. No unsupported ZIP asset is uploaded.
- Verify provenance with `gh attestation verify main.js --repo Feng6611/Obsidian-open-in-Teminal` after downloading a release asset.
- Recheck the [community dashboard](https://community.obsidian.md/account/plugins/open-in-terminal) after publishing. Local checks do not substitute for the directory's rescan.
- Follow Obsidian's [submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins).

## About the author

I'm [chenfeng](https://github.com/Feng6611). Besides Obsidian plugins I
build small, permission-light Mac apps — like
[Command Reopen](https://commandreopen.com), which fixes Cmd+Tab for
minimized windows. If this plugin saves you time, you can
[buy me a coffee](https://buymeacoffee.com/kkuk).

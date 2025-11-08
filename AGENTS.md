# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/`, with `src/main.ts` holding the Obsidian plugin, settings tab, and command registrations. Bundled output (`main.js`, `main.js.map`) is committed for release ingestion. `manifest.json`, `versions.json`, and `data.json` track plugin metadata for the Obsidian release feed; update them together when changing versions. Build tooling sits in `rollup.config.js` and `tsconfig.json`, while `node_modules/` and `package-lock.json` capture dependencies. Keep new assets or helper modules inside `src/` so Rollup picks them up.

## Build, Test, and Development Commands
Run `npm install` once to pull dependencies. Use `npm run dev` for a watch build while iterating; the command rebuilds `main.js` whenever `src/` files change. Use `npm run build` before publishing to ensure a clean Rollup bundle that Obsidian can load. Copy the resulting `manifest.json`, `main.js`, and `styles.css` (if present) into your local Obsidian vault’s `.obsidian/plugins/obsidian-open-in-terminal/` folder for manual testing.

## Linting & Quality Checks
Run `npm run lint` to execute ESLint 9 with the official `eslint-plugin-obsidianmd` rules and the TypeScript type-checked presets. The config focuses on Obsidian review requirements such as sentence-case UI text, safe settings headings, and manifest validation. Fix violations before pushing; the lint task catches subtle regressions (e.g., unsafe `any` assignments or accidental plugin-name reuse in commands) much earlier than the review bot.

## Coding Style & Naming Conventions
Write plugins in TypeScript with 2-space indentation and single quotes unless the string requires interpolation. Favor descriptive camelCase for variables/functions and PascalCase for classes such as `OpenInTerminalPlugin`. Keep UI labels in sentence case (e.g., “Terminal application name”) and avoid repeating the plugin name or the word “settings” in headings—the lint rules enforce this. Leverage helper methods like `addToggleSetting` to avoid duplicating setting widgets.

## Testing Guidelines
Automated tests are not yet defined, so rely on manual verification. After building, reload the plugin in Obsidian’s sandbox vault, confirm each command appears in the palette, and exercise platform-specific launch paths (Terminal, Claude Code, Codex CLI, Gemini CLI). When creating new settings, ensure defaults serialize through `this.plugin.saveSettings()` and verify logs via the “Enable debug logging” switch.

## Commit & Pull Request Guidelines
Follow the repository’s short, imperative commit style (e.g., “fix pr issue”, “manifest update”). Each PR should describe the user-facing change, reference related issues or review comments, and note testing performed. Include screenshots when altering UI text or settings, and avoid rebasing the release PR—push incremental commits so the Obsidian review bot can rescan automatically.

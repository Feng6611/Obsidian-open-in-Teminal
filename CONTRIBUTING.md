# Contributing

Use Node.js 22 and run `npm ci`, then `npm run check` before opening a pull request.

Add regression coverage for changes to quoting, working directories, settings migration or CLI prompt arguments. Tests must use harmless local processes and temporary directories, never live AI sessions or a user's Git repository. CI runs on Linux, macOS and Windows; actual terminal GUI and WSL distribution behavior should also be checked manually when those integrations change.

The supported minimum Obsidian version remains 1.5.0. Keep the legacy settings display fallback working when adding newer settings features. Do not rename stored configuration keys without a migration.

For releases, update `package.json`, `package-lock.json`, `manifest.json`, `versions.json` and `CHANGELOG.md` together. Publish a tag exactly matching the manifest version only after the checks pass. The release workflow builds and attests `main.js` and `manifest.json`, then uploads those files with the release notes. Confirm the new release in the community dashboard after the automated rescan; a local lint pass does not guarantee the remote scan outcome.

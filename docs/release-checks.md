# Release checks

Run `npm ci` and `npm run release:check` with Node.js 22. To check the intended tag locally, run `RELEASE_TAG=0.11.4 npm run release:check` (use the actual manifest version). On PowerShell, set `$env:RELEASE_TAG` first. A tag must be exactly `x.y.z`, without a `v` prefix.

The tag workflow runs the checks on Linux, macOS and Windows. All three must pass before the release job builds and attests the assets. It uploads a draft, downloads its required assets and compares SHA-256 hashes against the checked build, then publishes and verifies the public installation URLs. Missing or corrupted assets fail the workflow. A draft verification failure leaves an unpublished draft; a public verification failure leaves a published release and requires investigation.

## Plugin behavior and build checks

`npm run release:check` also executes the plugin lifecycle and registered command callbacks in a small Obsidian host fixture:

- Loading/saving malformed or legacy settings; no duplicate command registrations; disabled commands and availability checks do not launch processes.
- Normal note launches use the selected note directory, while Git stays at the vault root. A legitimate folder such as `..archive` is allowed; actual parent-directory escapes fall back to the root.
- Platform-specific settings definitions and the Obsidian 1.5 display fallback render without newer host APIs.
- Git detection handles missing executables, nonzero exits, signals and synchronous spawn failures. Its process has a ten-second timeout and hides the Windows console.
- Failed launches display a notice and retain delayed temporary-script cleanup.
- The built `main.js` loads as CommonJS with a stub host, imports only Obsidian/Node builtins, and exports an Obsidian Plugin subclass. Real filesystem/process APIs are unavailable during this smoke check.
- Changelog parsing requires one exact current-version heading and a nonempty section; it accepts LF and CRLF line endings.

The host fixture checks plugin wiring and rendering calls. It does not reproduce Obsidian's full UI or validate terminal window appearance.

## Issue history covered

Reviewed on 2026-10-19: all 13 issues in this repository, open and closed, including comments. Issue numbers have gaps because pull requests share the same sequence.

| Issues | Risk | Automated check | Remaining manual check |
| --- | --- | --- | --- |
| [#21](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/21), [#6](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/6) | Quoted WSL options; drive/UNC path conversion; Tabby routing | Inspect the final generated PowerShell argument string for bare `--distribution`, `--cd`, `--exec`; exercise drive and WSL UNC paths across terminal types | Launch with a real WSL distribution, including a vault path with spaces and non-ASCII text |
| [#18](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/18) | Native npm executable run through Node; CMD remainder quoting; detached PowerShell silently skips execution | Windows executes native/JS npm fixtures, raw CMD remainder and a marker script using the plugin's spawn options | Open the configured terminal from Obsidian and confirm the CLI stays usable |
| [#20](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/20), [#7](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/7) | Default branch manifest points at missing release files | Version/tag/lockfile compatibility checks; draft asset hashes and public downloads | Keep the default branch manifest at the last installable version until the new release is ready; see release order below |
| [#14](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/14) | Community review failure | Official `eslint-plugin-obsidianmd` recommended rules, zero lint warnings; stable plugin ID, desktop-only manifest, description, license and bundle checks | Check the community dashboard after the new release is scanned; keep filesystem/process disclosures accurate |
| [#10](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/10) | Unix path splitting and shell expansion | Execute scripts with spaces, quotes, shell metacharacters and multiline prompts; assert literal cwd and argv | Verify the chosen terminal emulator opens correctly |
| [#8](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/8) | Wrong note directory or escaping the vault | Note-folder fallback and vault containment; relative note context | No active note, nested note and Git commands (which must remain at vault root) |
| [#5](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/5) | Duplicate macOS app instances | macOS app reuse flags and script cleanup | Repeated launches with Terminal, iTerm and Ghostty; inspect Dock/window behavior |
| [#3](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/3) | Synced per-platform settings lose another device's terminal | Legacy string migration, missing-platform defaults and preservation of other platforms | Sync settings between two operating systems |
| [#12](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/12), [#4](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/4), [#2](https://github.com/Feng6611/Obsidian-open-in-Teminal/issues/2) | Note prompt boundaries and CLI integrations | Prompt prefix/suffix, relative note paths and each CLI's prompt argument convention | Test enabled CLI commands against installed versions and confirm settings preview |

## Release order

1. Prepare version changes on a release branch: `package.json`, `package-lock.json`, `manifest.json`, `versions.json` and `CHANGELOG.md`. Keep the published plugin ID unchanged.
2. Run `npm run release:check` and complete the manual checks for integrations affected by the change. Push the release branch and an exact version tag pointing at that commit. Do not merge the new manifest into the default branch before the assets are published.
3. Wait for the tag workflow's three-platform checks, draft verification, publication and public URL verification. If a previous run left a draft, rerun after correcting the failure. Never reuse a tag to ship different source code or overwrite an already published release.
4. Merge the same release commit into the default branch after successful publication. Run `npm run release:verify` at that commit to confirm the public assets again. This order prevents the installation gap reported in #7 and #20; a tag check alone cannot prevent an earlier manifest bump on the default branch.
5. Confirm the community dashboard scan and install/update in a clean vault. Official lint is a local preflight, not proof that the remote scan passed. In #14 the Obsidian maintainer confirmed that capability warnings alone do not prevent installation.

The workflow does not automate the graphical terminal, a live WSL installation, third-party CLI sessions or the authenticated community dashboard. Test fixtures use temporary directories and harmless local processes.

## Official tooling

- [Obsidian ESLint plugin](https://github.com/obsidianmd/eslint-plugin): already configured in `eslint.config.mjs`; its locked version is installed with `npm ci`.
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).
- [Release format and required assets](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).
- [Community dashboard](https://community.obsidian.md/account/plugins/open-in-terminal).

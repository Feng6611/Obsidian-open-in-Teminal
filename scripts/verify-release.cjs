// Verify the exact files Obsidian installs, before and after publishing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const manifest = require('../manifest.json');
const root = path.resolve(__dirname, '..');
const assets = ['manifest.json', 'main.js', ...(fs.existsSync(path.join(root, 'styles.css')) ? ['styles.css'] : [])];
function verifyAssets(release, read) {
  assert.equal(release.tagName, manifest.version, 'release tag must match manifest');
  assert.equal(release.isPrerelease, false, 'Obsidian releases must not be prereleases');
  for (const name of assets) {
    assert.equal(release.assets.filter(asset => asset.name === name).length, 1, `missing or duplicate asset: ${name}`);
    const downloaded = read(name);
    assert(downloaded.length > 0, `empty release asset: ${name}`);
    const hash = value => createHash('sha256').update(value).digest('hex');
    assert.equal(hash(downloaded), hash(fs.readFileSync(path.join(root, name))), `release asset differs from checked build: ${name}`);
  }
  assert.deepEqual(JSON.parse(read('manifest.json').toString('utf8')), manifest, 'downloaded manifest mismatch');
}
async function main() {
  const repo = process.env.GITHUB_REPOSITORY || 'Feng6611/Obsidian-open-in-Teminal';
  const tag = process.env.RELEASE_TAG || manifest.version;
  assert.equal(tag, manifest.version, 'tag must match manifest exactly');
  if (process.argv.includes('--before-upload')) {
    let existing;
    try {
      existing = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/releases/tags/${tag}`], {encoding:'utf8', stdio:['ignore','pipe','pipe']}));
    } catch (error) {
      if (!String(error.stderr).includes('(HTTP 404)')) throw error;
      console.log(`Release ${tag} does not exist; draft upload allowed`);
      return;
    }
    assert.equal(existing.draft, true, 'refusing to overwrite an already published release; use a new version');
    console.log(`Release ${tag} is an unpublished draft; upload allowed`);
    return;
  }
  const release = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName,isDraft,isPrerelease,assets'], {encoding:'utf8'}));
  if (process.argv.includes('--public')) {
    assert.equal(release.isDraft, false, 'release is still a draft');
    // Public URLs are the route used by Obsidian; API metadata alone is insufficient.
    let lastError;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const downloaded = new Map();
        for (const name of assets) {
          const response = await fetch(`https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${name}`, {signal:AbortSignal.timeout(30000)});
          assert(response.ok, `${name}: HTTP ${response.status}`);
          downloaded.set(name, Buffer.from(await response.arrayBuffer()));
        }
        verifyAssets(release, name => downloaded.get(name));
        console.log(`Public release ${tag}: install URLs and SHA-256 verified`);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    throw lastError;
  }
  assert.equal(release.isDraft, true, 'verify a draft before publishing');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-release-'));
  try {
    execFileSync('gh', ['release', 'download', tag, '--repo', repo, '--dir', dir, ...assets.flatMap(name => ['--pattern', name])], {stdio:'inherit'});
    verifyAssets(release, name => fs.readFileSync(path.join(dir, name)));
    console.log(`Draft release ${tag}: required assets and SHA-256 verified`);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
module.exports = { verifyAssets };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

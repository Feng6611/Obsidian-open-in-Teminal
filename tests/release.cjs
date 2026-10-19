const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Exercise the real validator in an isolated build fixture, including failure paths.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-release-test-'));
try {
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.copyFileSync(path.join(root,'scripts/verify-release.cjs'),path.join(dir,'scripts/verify-release.cjs'));
  const manifest = {version:'1.2.3'};
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir,'main.js'),'checked bundle');
  fs.writeFileSync(path.join(dir,'styles.css'),'checked styles');
  const {verifyAssets} = require(path.join(dir,'scripts/verify-release.cjs'));
  const release = {tagName:'1.2.3', isPrerelease:false, assets:['main.js','manifest.json','styles.css'].map(name=>({name}))};
  const read = name => fs.readFileSync(path.join(dir,name));
  verifyAssets(release, read);
  assert.throws(()=>verifyAssets({...release,tagName:'v1.2.3'},read),/tag/);
  assert.throws(()=>verifyAssets({...release,isPrerelease:true},read),/prereleases/);
  for (const name of ['main.js','manifest.json','styles.css']) {
    assert.throws(()=>verifyAssets({...release,assets:release.assets.filter(a=>a.name!==name)},read),/missing/);
    assert.throws(()=>verifyAssets(release,n=>n===name?Buffer.from('corrupt'):read(n)),/differs/);
  }
  const preflight=path.join(dir,'preflight');
  fs.mkdirSync(path.join(preflight,'scripts'),{recursive:true});
  for (const name of ['package.json','package-lock.json','manifest.json','versions.json','CHANGELOG.md','README.md','LICENSE','scripts/check-release.cjs','scripts/release-notes.cjs']) {
    fs.copyFileSync(path.join(root,name),path.join(preflight,name));
  }
  fs.writeFileSync(path.join(preflight,'main.js'),"module.exports = class extends require('obsidian').Plugin {};");
  const version=JSON.parse(fs.readFileSync(path.join(preflight,'manifest.json'),'utf8')).version;
  for (const [tag,valid] of [[version,true],[`v${version}`,false],['999.0.0',false]]) {
    const result=cp.spawnSync(process.execPath,['scripts/check-release.cjs','scripts/release-notes.cjs'],{cwd:preflight,env:{...process.env,RELEASE_TAG:tag},encoding:'utf8'});
    if (valid) assert.equal(result.status,0,result.stderr);
    else {
      assert.notEqual(result.status,0);
      assert.match(result.stderr,/tag must match manifest version exactly/);
    }
  }
  const runPreflight=()=>cp.spawnSync(process.execPath,['scripts/check-release.cjs'],{cwd:preflight,env:{...process.env,RELEASE_TAG:version},encoding:'utf8'});
  for (const [bundle,message] of [
    ['export default class {}','Unexpected token'],
    ["require('missing-runtime-package');",'unshipped dependency'],
    ['module.exports = {};','export a plugin class'],
    ['module.exports = class {};','extend Obsidian Plugin']
  ]) {
    fs.writeFileSync(path.join(preflight,'main.js'),bundle);
    const result=runPreflight();
    assert.notEqual(result.status,0);
    assert(result.stderr.includes(message),result.stderr);
  }
  const {releaseNotes}=require('../scripts/release-notes.cjs');
  assert.equal(releaseNotes('# Notes\r\n\r\n## 1.2.3\r\n\r\n- Fix.\r\n\r\n## 1.2.2\r\nOlder','1.2.3'),'- Fix.');
  for (const input of ['## 1.2.30\nWrong version','## 1.2.3\n\n## 1.2.2\nOlder','## 1.2.3\nFirst\n## 1.2.3\nDuplicate']) {
    assert.throws(()=>releaseNotes(input,'1.2.3'));
  }
  console.log('PASS packaged plugin rejects broken syntax, missing dependencies and invalid exports; changelog sections validated');
  console.log('PASS release assets reject missing/corrupt files, prereleases and mismatched tags');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }

const assert = require('node:assert/strict');
const fs = require('node:fs');
const pkg = require('../package.json');
const manifest = require('../manifest.json');
const lock = require('../package-lock.json');
const versions = require('../versions.json');
const vm = require('node:vm');
const { isBuiltin } = require('node:module');
const { releaseNotes } = require('./release-notes.cjs');
assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Obsidian requires an x.y.z version');
assert.equal(manifest.id, 'open-in-terminal', 'published plugin ID must remain stable');
assert.equal(manifest.isDesktopOnly, true, 'Node/process APIs require desktop-only manifest');
assert(manifest.description.length <= 250 && manifest.description.endsWith('.'), 'description must be <=250 characters and end in a period');
for (const file of ['README.md', 'LICENSE', 'main.js']) assert(fs.statSync(file).size > 0, `missing or empty release file: ${file}`);
assert.equal(pkg.version,manifest.version,'package/manifest version mismatch');
assert.equal(lock.version,manifest.version,'lockfile version mismatch');
assert.equal(lock.packages[''].version,manifest.version,'lockfile root version mismatch');
assert.equal(versions[manifest.version],manifest.minAppVersion,'versions.json compatibility mismatch');
if(process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG,manifest.version,'tag must match manifest version exactly');
assert(!/obsidian/i.test(manifest.description),'description must not repeat Obsidian');
const output=fs.readFileSync('main.js','utf8');
assert(!/\b__(?:awaiter|generator|spreadArray)\b/.test(output),'legacy transpilation helpers found');
releaseNotes(fs.readFileSync('CHANGELOG.md','utf8'), manifest.version);
// Load the exact distributable with a minimal host. Do not execute real OS APIs.
class Plugin {}
const host = {Plugin, PluginSettingTab: class {}, Platform: {isDesktopApp:true,isLinux:true}};
const moduleFixture = {exports:{}};
new vm.Script(output, {filename:'main.js'}).runInNewContext({
  module:moduleFixture,
  exports:moduleFixture.exports,
  require: name => {
    if (name === 'obsidian') return host;
    assert(isBuiltin(name), `bundle requires an unshipped dependency: ${name}`);
    return {};
  }
}, {timeout:1000});
assert.equal(typeof moduleFixture.exports, 'function', 'bundle must export a plugin class');
assert(moduleFixture.exports.prototype instanceof Plugin, 'bundle default export must extend Obsidian Plugin');
console.log(`Release ${manifest.version}: versions, description, bundle loading and notes verified`);

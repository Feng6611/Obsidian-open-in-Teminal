const fs = require('node:fs');
const {version} = require('../manifest.json');
function releaseNotes(changelog, currentVersion) {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  const header = `## ${currentVersion}`;
  const headings = lines.map((line,index) => line.trim() === header ? index : -1).filter(index => index >= 0);
  if (headings.length !== 1) throw new Error('Expected exactly one changelog heading for current version');
  const start = headings[0] + 1;
  const next = lines.findIndex((line,index) => index >= start && /^##\s/.test(line));
  const section = lines.slice(start, next < 0 ? undefined : next).join('\n').trim();
  if (!section) throw new Error('No release notes for current version');
  return section;
}
module.exports = { releaseNotes };
if (require.main === module) console.log(releaseNotes(fs.readFileSync('CHANGELOG.md','utf8'),version));

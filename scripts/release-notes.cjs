const fs=require('node:fs');
const {version}=require('../manifest.json');
const changelog=fs.readFileSync('CHANGELOG.md','utf8');
const section=changelog.split(`## ${version}\n`)[1]?.split('\n## ')[0]?.trim();
if(!section) throw new Error('No release notes for current version');
console.log(section);

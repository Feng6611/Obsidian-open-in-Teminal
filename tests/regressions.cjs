const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
const platform = { isDesktopApp: true, isMacOS: false, isWin: false, isLinux: true };
const original = Module._load;
Module._load = function(id, ...args) {
  if (id === 'obsidian') return { Platform: platform };
  return original.call(this, id, ...args);
};
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, file);
const settings = require('../src/settings.ts');
const launcher = require('../src/launcher.ts');
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch(error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
test('missing platform uses default without losing synced settings', () => {
  const value = settings.normalizeSettings({terminalApp:{macos:'iTerm'}});
  assert.equal(settings.getCurrentTerminalApp(value.terminalApp), 'x-terminal-emulator');
  assert.deepEqual(settings.setCurrentTerminalApp(value.terminalApp, 'konsole'), {macos:'iTerm',linux:'konsole'});
});
test('legacy string and explicit blank normalize correctly', () => {
  assert.equal(settings.getCurrentTerminalApp(settings.normalizeSettings({terminalApp:' konsole '}).terminalApp),'konsole');
  assert.equal(settings.getCurrentTerminalApp({linux:'  '}),'x-terminal-emulator');
});
const context = require('../src/note-context.ts');
test('note context follows launch directory and preserves whitespace', () => {
  const value = {...settings.DEFAULT_SETTINGS, enableNoteContext:true, promptPrefix:'Read (', promptSuffix:')\nThen plan.'};
  assert.equal(context.buildNotePrompt(value,'Projects/A/note.md'),'Read (Projects/A/note.md)\nThen plan.');
  assert.equal(context.buildNotePrompt({...value,openAtCurrentNoteFolder:true},'Projects/A/note.md'),'Read (note.md)\nThen plan.');
  assert.equal(context.buildNotePrompt(value),undefined);
  assert.equal(context.buildNotePrompt({...value,enableNoteContext:false},'note.md'),undefined);
  for(const tool of ['claude','codex','agent']) assert.deepEqual(context.promptArguments(tool,'--help'),['--','--help']);
  assert.deepEqual(context.promptArguments('copilot','--help'),['--interactive=--help']);
  assert.deepEqual(context.promptArguments('gemini','--help'),['--prompt-interactive=--help']);
  assert.deepEqual(context.promptArguments('opencode','--help'),['--prompt=--help']);
});
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-regression-'));
try {
  const vault = path.join(root, process.platform === 'win32' ? 'My Vault & %PATH% !wow! $HOME \'quote\' 中文' : 'My Vault $(printf CHANGED) `printf BAD` "quote" \'single\' $HOME');
  fs.mkdirSync(vault);
  const capture = path.join(root,'capture.cjs');
  fs.writeFileSync(capture,'console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}))');
  const terminal = path.join(root,'gnome-terminal');
  fs.writeFileSync(terminal,'#!/bin/sh\n[ "$1" = "--" ] && shift\nexec "$@"\n',{mode:0o755});
  if (process.platform !== 'win32') test('Unix launch preserves literal paths and argument boundaries', () => {
    const values = ['Read note "hello" $(printf WRONG) `printf WRONG` $HOME', 'line1\nline2'];
    const launch=launcher.buildLaunchCommand(terminal,vault,{kind:'tool',executable:process.execPath,args:[capture,...values]});
    assert.equal(typeof launch.executable,'string');
    const result=cp.spawnSync(launch.executable,launch.args,{cwd:launch.cwd,env:{...process.env,SHELL:'/usr/bin/true'},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stderr,'');
    const actual=JSON.parse(result.stdout.trim());
    assert.deepEqual([fs.statSync(actual.cwd).dev,fs.statSync(actual.cwd).ino],[fs.statSync(vault).dev,fs.statSync(vault).ino]);
    assert.deepEqual(actual.args,values);
  });
  if (process.platform !== 'win32') test('macOS script preserves paths and aborts if cd fails', () => {
    platform.isMacOS=true; platform.isLinux=false;
    const action={kind:'tool',executable:process.execPath,args:[capture]};
    for(const cwd of [vault,path.join(root,'missing')]) {
      const launch=launcher.buildLaunchCommand('Terminal',cwd,action);
      try {
        assert.equal(launch.executable,'open');
        const script=launch.args.at(-1);
        const result=cp.spawnSync('/bin/bash',[script],{cwd:root,env:{...process.env,SHELL:'/usr/bin/true'},encoding:'utf8'});
        if(cwd===vault) { assert.equal(result.status,0,result.stderr); assert.equal(fs.realpathSync(JSON.parse(result.stdout).cwd),fs.realpathSync(vault)); }
        else { assert.notEqual(result.status,0); assert.equal(result.stdout,''); }
      } finally { launch.cleanup(); }
    }
    platform.isMacOS=false; platform.isLinux=true;
  });

  if(process.platform !== 'win32') test('Git stops before push on commit failure and preserves message', () => {
    const log=path.join(root,'git-log');
    const stub=path.join(root,'git');
    fs.writeFileSync(stub,`#!/usr/bin/env node\nconst fs=require('fs'); fs.appendFileSync(process.env.TEST_GIT_LOG,JSON.stringify(process.argv.slice(2))+'\\n'); if(process.argv[2]==='commit' && process.env.TEST_GIT_FAIL) process.exit(2);`,{mode:0o755});
    const message='say "hello" $(printf BAD) `echo BAD` $HOME & x\nnext';
    for(const fail of [false,true]) {
      fs.writeFileSync(log,'');
      const launch=launcher.buildLaunchCommand('gnome-terminal',vault,{kind:'git',action:'commit-push',message});
      const result=cp.spawnSync('/bin/bash',['-c',launch.args.at(-1)],{cwd:root,encoding:'utf8',env:{...process.env,PATH:root+path.delimiter+process.env.PATH,SHELL:'/usr/bin/true',TEST_GIT_LOG:log,TEST_GIT_FAIL:fail?'1':''}});
      assert.equal(result.stderr,'');
      const calls=fs.readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line));
      assert.deepEqual(calls,[['add','.'],['commit','-m',message],...(!fail?[['push']]:[])]);
    }
  });
  test('Windows launch keeps prompts out of nested command lines', () => {
    platform.isWin=true; platform.isMacOS=false; platform.isLinux=false;
    const values=['Read "quoted" note $(echo BAD) & echo BAD %PATH% !x!', 'a\\b\\', 'line1\nline2', '中文'];
    for(const app of ['powershell.exe','cmd.exe','wt.exe','tabby.exe']) {
      const launch=launcher.buildLaunchCommand(app,vault,{kind:'tool',executable:process.execPath,args:[capture,...values]});
      try {
        const outer=Buffer.from(launch.args.at(-1),'base64').toString('utf16le');
        const match=outer.match(/-EncodedCommand[" ]+([A-Za-z0-9+/=]+)/);
        assert(match,outer);
        const bootstrap=Buffer.from(match[1],'base64').toString('utf16le');
        const file=bootstrap.slice(3,-1).replace(/''/g,"'");
        assert.equal(fs.existsSync(file),true,bootstrap);
        assert(outer.length < 8191);
        if(process.platform === 'win32') {
          // Run the exact generated inner script without opening a GUI window.
          const result=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{cwd:root,encoding:'utf8'});
          assert.equal(result.status,0,result.stderr);
          assert.equal(result.stderr,'');
          const actual=JSON.parse(result.stdout.trim());
          assert.deepEqual([fs.statSync(actual.cwd).dev,fs.statSync(actual.cwd).ino],[fs.statSync(vault).dev,fs.statSync(vault).ino]);
          assert.deepEqual(actual.args,values);
        }
      } finally { launch.cleanup(); }
    }
    if(process.platform === 'win32') {
      const packageDir=path.join(root,'node_modules','@openai','codex');
      fs.mkdirSync(packageDir,{recursive:true});
      fs.writeFileSync(path.join(packageDir,'package.json'),JSON.stringify({bin:{codex:'cli.cjs'}}));
      fs.copyFileSync(capture,path.join(packageDir,'cli.cjs'));
      fs.writeFileSync(path.join(root,'codex.cmd'),'@echo off\r\necho SHIM_MUST_NOT_EXECUTE\r\n');
      const launch=launcher.buildLaunchCommand('powershell.exe',vault,{kind:'tool',executable:'codex',args:values});
      try {
        const outer=Buffer.from(launch.args.at(-1),'base64').toString('utf16le');
        const bootstrap=Buffer.from(outer.match(/-EncodedCommand[" ]+([A-Za-z0-9+/=]+)/)[1],'base64').toString('utf16le');
        const file=bootstrap.slice(3,-1).replace(/''/g,"'");
        const result=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{cwd:root,encoding:'utf8',env:{...process.env,PATH:root+path.delimiter+process.env.PATH}});
        assert.equal(result.status,0,result.stderr);
        assert.deepEqual(JSON.parse(result.stdout.trim()).args,values);
      } finally {launch.cleanup();}
    }
    const probe=launcher.buildGitProbe('\\\\wsl.localhost\\Ubuntu\\home\\user\\My Vault',true);
    assert.deepEqual(probe.args,['--distribution','Ubuntu','--cd','/home/user/My Vault','--exec','git','rev-parse','--is-inside-work-tree']);
    const drive=launcher.buildGitProbe('C:\\My Vault',true);
    assert(drive.args.includes('/mnt/c/My Vault'));
    platform.isWin=false; platform.isLinux=true;
  });
} finally { fs.rmSync(root,{recursive:true,force:true}); }
process.exitCode = failed ? 1 : 0;

// Exercise plugin behavior through Obsidian's lifecycle and command callbacks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const {EventEmitter} = require('node:events');
const ts = require('typescript');
const platform = {isDesktopApp:true,isMacOS:false,isWin:false,isLinux:true};
const notices=[];
class Plugin {
  commands=[]; tabs=[];
  async loadData() { return this.stored; }
  async saveData(value) { this.saved=JSON.parse(JSON.stringify(value)); }
  addCommand(command) { this.commands.push(command); }
  addSettingTab(tab) { this.tabs.push(tab); }
}
class FileSystemAdapter { getBasePath() { return os.tmpdir(); } }
class PluginSettingTab { constructor(app,plugin) { this.app=app;this.plugin=plugin; } }
const obsidian={Platform:platform,Plugin,FileSystemAdapter,PluginSettingTab,Notice:class {constructor(text){notices.push(text);}}};
const originalLoad=Module._load;
Module._load=function(id,...args){return id==='obsidian'?obsidian:originalLoad.call(this,id,...args);};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const OpenPlugin=require('../src/main.ts').default;
const settings=require('../src/settings.ts');
const {launchTargets}=require('../src/targets.ts');
const {OpenInTerminalSettingTab}=require('../src/settings-tab.ts');
const originalSpawn=cp.spawn;
const oldWindow=global.window;
const originalConsoleError=console.error;
async function main() {
  const plugin=new OpenPlugin();
  plugin.app={vault:{adapter:new FileSystemAdapter()},workspace:{getActiveFile:()=>({path:'Projects/note.md',parent:{path:'Projects'}})}};
  plugin.stored={terminalApp:{macos:'iTerm'},enableClaude:'true',promptPrefix:null};
  await plugin.onload();
  assert.equal(plugin.tabs.length,1);
  assert.equal(plugin.commands.length,launchTargets.length);
  assert.equal(new Set(plugin.commands.map(c=>c.id)).size,plugin.commands.length);
  plugin.refreshCommands();
  await plugin.saveSettings();
  assert.equal(plugin.commands.length,launchTargets.length,'saving settings must not register commands twice');
  assert.equal(plugin.pluginSettings.enableClaude,false,'string true must not enable commands');
  assert.deepEqual(plugin.saved.terminalApp,{macos:'iTerm'});
  for (const target of launchTargets) {
    const command=plugin.commands.find(c=>c.id===target.id);
    let runs=0;
    plugin.runLaunchCommand=()=>runs++;
    plugin.runGitCommitPush=async()=>runs++;
    plugin.runGitPull=async()=>runs++;
    if (target.settingKey) {
      assert.equal(command.checkCallback(false),false);
      assert.equal(runs,0,'disabled command must not execute');
      plugin.pluginSettings[target.settingKey]=true;
    }
    assert.equal(command.checkCallback(true),true);
    assert.equal(runs,0,'availability checks must have no launch side effects');
    assert.equal(command.checkCallback(false),true);
    assert.equal(runs,1,`${target.id} must dispatch once`);
  }
  console.log('PASS lifecycle, persisted settings, unique commands and toggle/dispatch behavior');

  plugin.pluginSettings=settings.normalizeSettings({openAtCurrentNoteFolder:true,enableNoteContext:true});
  const normal=plugin.composeLaunchCommand();
  assert.equal(normal.cwd,path.join(os.tmpdir(),'Projects'));
  const git=plugin.composeLaunchCommand({kind:'git',action:'pull'},true);
  assert.equal(git.cwd,os.tmpdir(),'Git must remain at vault root');
  for (const state of ['linux','macos','win']) {
    Object.assign(platform,{isMacOS:state==='macos',isWin:state==='win',isLinux:state==='linux'});
    const tab=new OpenInTerminalSettingTab(plugin.app,plugin);
    const definitions=tab.getSettingDefinitions();
    const names=definitions.map(d=>d.name);
    assert.equal(new Set(names).size,names.length);
    assert.equal(names.includes('Use WSL for commands'),state==='win');
    assert.equal(names.includes('Reuse existing terminal instance'),state==='macos');
    let rows=0;
    obsidian.Setting=class {
      constructor(){ rows++; this.controlEl={addClass(){}}; }
      setName(){return this;} setDesc(){return this;}
      addToggle(fn){fn(this);return this;} addText(fn){fn(this);return this;} addTextArea(fn){fn(this);return this;}
      addButton(fn){fn(this);return this;} setButtonText(){return this;} onClick(){return this;}
      setValue(){return this;} setPlaceholder(){return this;} onChange(){return this;}
    };
    let emptied=false;
    tab.containerEl={empty:()=>{emptied=true;}};
    tab.display();
    assert(emptied);assert.equal(rows,definitions.length + 1,'Support row renders after settings');
    tab.hide();assert.equal(tab.preview,undefined);
  }
  console.log('PASS note/Git directory routing and legacy settings rendering on all platforms');

  Object.assign(platform,{isMacOS:false,isWin:true,isLinux:false});
  for (const outcome of ['success','nonzero','signal','error','throw']) {
    let options;
    cp.spawn=(_exe,_args,value)=>{
      options=value;
      if(outcome==='throw')throw new Error('invalid cwd');
      const child=new EventEmitter();
      queueMicrotask(()=>outcome==='error'?child.emit('error',new Error('missing git')):child.emit('close',outcome==='success'?0:outcome==='signal'?null:1));
      return child;
    };
    assert.equal(await plugin.checkGitRepo(),outcome==='success');
    assert.equal(options.shell,false);assert.equal(options.windowsHide,true);
    assert.equal(options.timeout,10000);
  }
  console.log('PASS Git probe handles missing executables, failures/signals and synchronous errors');

  const executor=new OpenPlugin();executor.app=plugin.app;
  const timers=[];
  global.window={setTimeout:(fn,delay)=>{assert.equal(delay,30000);timers.push(fn);return 1;}};
  console.error=()=>{};
  for (const outcome of ['error','nonzero','throw']) {
    let cleaned=0;
    cp.spawn=()=>{
      if(outcome==='throw')throw new Error('spawn failed');
      const child=new EventEmitter();child.unref=()=>{};
      queueMicrotask(()=>outcome==='error'?child.emit('error',new Error('missing app')):child.emit('exit',2));
      return child;
    };
    const before=notices.length;
    executor.executeShellCommand({executable:'fixture',args:[],cwd:os.tmpdir(),cleanup:()=>cleaned++},'fixture');
    await Promise.resolve();
    assert.equal(notices.length,before+1,'launch failures need visible feedback');
    assert.equal(cleaned,0);
    timers.pop()();assert.equal(cleaned,1,'temporary scripts must be cleaned after failed launches');
  }
  console.log('PASS launch errors show notices and schedule temporary-script cleanup');
}
main().catch(error=>{console.error=originalConsoleError;console.error(error);process.exitCode=1;}).finally(()=>{
  cp.spawn=originalSpawn;Module._load=originalLoad;global.window=oldWindow;console.error=originalConsoleError;
});

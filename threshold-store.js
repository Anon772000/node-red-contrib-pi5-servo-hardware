'use strict';
const fs=require('node:fs'),path=require('node:path');
function validateDocument(d,siteId) {
  const fail=()=>{throw Error('Invalid hub threshold document');};
  if(d?.schemaVersion!==1||d.siteId!==siteId||!/^site-[1-9]\d*$/.test(siteId))fail();
  const s=d.settings,finite=v=>typeof v==='number'&&Number.isFinite(v);
  if(!s||typeof s.commissioned!=='boolean'||typeof s.automationEnabled!=='boolean'||typeof s.allowEstimatedSoilAutomation!=='boolean'||!['%','raw',null].includes(s.soilMoistureUnit)||!finite(s.staleAfterSeconds)||s.staleAfterSeconds<2||s.staleAfterSeconds>86400||(s.manualOverrideSeconds!==null&&(!finite(s.manualOverrideSeconds)||s.manualOverrideSeconds<1||s.manualOverrideSeconds>86400))||!s.valve||!s.vent)fail();
  for(const [low,high,min,max] of [[s.valve.openBelow,s.valve.closeAbove,0,100],[s.vent.temperatureCloseBelow,s.vent.temperatureOpenAbove,-40,80],[s.vent.humidityCloseBelow,s.vent.humidityOpenAbove,0,100]]){
    if(low==null&&high==null)continue;
    if(!finite(low)||!finite(high)||low>=high||low<min||high>max)fail();
  }
  if((s.valve.maxOpenSeconds!==null&&(!finite(s.valve.maxOpenSeconds)||s.valve.maxOpenSeconds<1||s.valve.maxOpenSeconds>86400))||!['any','all'].includes(s.vent.openWhen))fail();
  if(!d.overrides||Object.keys(d.overrides).some(k=>!['valve','vent'].includes(k))||Object.values(d.overrides).some(v=>!finite(v)||v<0))fail();
  return d;
}
function createStore(directory,siteId,{fileSystem=fs}={}) {
  if(!/^site-[1-9]\d*$/.test(siteId))throw Error('Invalid cache site ID');
  const filename=path.join(directory,siteId+'.json'),blockFile=path.join(directory,siteId+'-state.json');
  let current=null;
  function atomicWrite(file,data){
    fileSystem.mkdirSync(directory,{recursive:true,mode:0o700});
    const temporary=file+'.tmp';let fd;
    try {
      fd=fileSystem.openSync(temporary,'w',0o600);fileSystem.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fileSystem.fsyncSync(fd);fileSystem.closeSync(fd);fd=undefined;
      fileSystem.renameSync(temporary,file);
      const dir=fileSystem.openSync(directory,'r');try{fileSystem.fsyncSync(dir);}finally{fileSystem.closeSync(dir);}
    }catch(error){if(fd!==undefined)fileSystem.closeSync(fd);throw error;}
  }
  function load(){
    if(!fileSystem.existsSync(filename))return null;
    current=validateDocument(JSON.parse(fileSystem.readFileSync(filename,'utf8')),siteId);return current;
  }
  function save(document){
    validateDocument(document,siteId);
    const stable={schemaVersion:1,siteId,settings:document.settings,overrides:document.overrides};
    if(JSON.stringify(stable)===JSON.stringify(current))return false;
    atomicWrite(filename,stable);current=JSON.parse(JSON.stringify(stable));return true;
  }
  function loadBlocked(){
    if(!fileSystem.existsSync(blockFile))return false;
    const state=JSON.parse(fileSystem.readFileSync(blockFile,'utf8'));
    if(state.siteId!==siteId||typeof state.waterBlocked!=='boolean')throw Error('Invalid local watering state');
    return state.waterBlocked;
  }
  return {load,save,filename,loadBlocked,saveBlocked:waterBlocked=>atomicWrite(blockFile,{siteId,waterBlocked})};
}
module.exports={validateDocument,createStore};

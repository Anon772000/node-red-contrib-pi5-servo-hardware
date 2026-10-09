'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {OfflineRules}=require('../offline-rules'),{validateDocument,createStore}=require('../threshold-store');
const document={schemaVersion:1,siteId:'site-1',settings:{commissioned:true,automationEnabled:true,soilMoistureUnit:'%',allowEstimatedSoilAutomation:false,
 staleAfterSeconds:30,manualOverrideSeconds:600,alerts:{temperatureAbove:30},valve:{openBelow:30,closeAbove:40,maxOpenSeconds:5},vent:{openWhen:'any',temperatureOpenAbove:20,temperatureCloseBelow:19,humidityOpenAbove:90,humidityCloseBelow:65}},overrides:{}};
let now=100000,sent=[],persisted=[];
function model(d=document,options={}){
 const m=new OfflineRules({siteId:'site-1',hubTimeoutSeconds:45,localMaxSeconds:60,now:()=>now,emit:msg=>sent.push(msg),persistBlocked:value=>persisted.push(value),...options});
 if(d)m.configure(structuredClone(d));m.feedback('valve',false);m.feedback('vent',false);return m;
}
let m=model();m.reading({temperature:23,humidity:55,soilMoisture:20});m.broker(true);m.hubAlive();m.tick();assert.equal(sent.length,0,'Hub control has sole authority while its heartbeat is fresh');
now+=45001;m.feedback('valve',false);m.feedback('vent',false);m.reading({temperature:23,humidity:55,soilMoisture:20});m.tick();assert.equal(m.mode(),'offline');assert.deepEqual(sent.map(v=>[v.topic,v.payload]),[['sites/site-1/valve/set',true],['sites/site-1/vent/set',true]]);
m.feedback('valve',true);m.feedback('vent',true);now+=5000;m.tick();assert.equal(sent.at(-1).payload,false);assert.equal(m.waterBlocked,true);assert.equal(persisted.at(-1),true);
m.feedback('valve',false);now+=1000;m.reading({soilMoisture:20});const count=sent.length;m.tick();assert.equal(sent.length,count,'Cutoff does not repeatedly water dry soil');
m.reading({soilMoisture:45});m.tick();assert.equal(m.waterBlocked,false);m.reading({soilMoisture:20});m.tick();assert.equal(sent.at(-1).payload,true);
m.broker(true);m.hubAlive();const afterReconnect=sent.length;m.tick();assert.equal(m.mode(),'hub');assert.equal(sent.length,afterReconnect,'Reconnected hub takes back automation authority');
sent=[];m=model();m.reading({temperature:19.5,humidity:70,soilMoisture:35});m.tick();assert.equal(sent.length,0,'Hysteresis holds in the threshold bands');
m.feedback('vent',true);m.reading({temperature:18,humidity:64});m.tick();assert.deepEqual(sent.map(x=>[x.topic,x.payload]),[['sites/site-1/vent/set',false]]);
sent=[];m=model();m.feedback('valve',true);now+=31000;m.tick();assert.equal(sent.at(-1).payload,false,'Stale soil closes water');
sent=[];m=model();m.reading({temperature:23,humidity:55,soilMoisture:20,soilMoistureEstimated:true});m.tick();assert.ok(!sent.some(x=>x.topic.endsWith('valve/set')&&x.payload),'Estimated soil is excluded unless the hub allows it');
sent=[];m=model({...document,settings:{...document.settings,vent:{...document.settings.vent,openWhen:'all'}}});m.reading({temperature:23,humidity:55});m.tick();assert.equal(sent.length,0);m.reading({humidity:95});m.tick();assert.equal(sent.at(-1).payload,true);
sent=[];m=model({...document,overrides:{valve:now+600000,vent:now+600000}});m.reading({temperature:23,humidity:55,soilMoisture:20});m.tick();assert.equal(sent.length,0,'Unexpired hub manual overrides survive offline fallback');
sent=[];m=model(null);m.reading({temperature:23,soilMoisture:20});m.tick();assert.equal(sent.length,0,'No cached rules means no invented automation');
sent=[];m=model({...document,settings:{...document.settings,automationEnabled:false}});m.reading({temperature:23,soilMoisture:20});m.tick();assert.equal(sent.length,0);
for(const d of [{...document,siteId:'site-3'},{...document,schemaVersion:2},{...document,settings:{...document.settings,valve:{...document.settings.valve,openBelow:50}}}])assert.throws(()=>validateDocument(d,'site-1'));
if(process.platform!=='win32'){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'site1-threshold-test-'));
 try {
  let store=createStore(directory,'site-1');assert.equal(store.load(),null);assert.equal(store.save(document),true);
  const initial=fs.statSync(store.filename).mtimeMs;assert.equal(store.save({...document,sentAt:now+15000}),false);assert.equal(fs.statSync(store.filename).mtimeMs,initial,'Heartbeats do not wear the SD card by rewriting unchanged rules');
  store.saveBlocked(true);store=createStore(directory,'site-1');assert.deepEqual(store.load(),document);assert.equal(store.loadBlocked(),true,'Watering lockout survives restart');
  assert.equal(fs.statSync(store.filename).mode&0o777,0o600);
  const reloaded=model(store.load(),{blocked:store.loadBlocked()});reloaded.reading({temperature:23,humidity:55,soilMoisture:20});sent=[];reloaded.tick();assert.ok(sent.some(v=>v.topic.endsWith('vent/set')&&v.payload));assert.ok(!sent.some(v=>v.topic.endsWith('valve/set')&&v.payload));
  const broken=createStore(directory,'site-1',{fileSystem:new Proxy(fs,{get:(target,key)=>key==='renameSync'?()=>{throw Error('simulated disk failure');}:target[key]})});broken.load();assert.throws(()=>broken.save({...document,settings:{...document.settings,valve:{...document.settings.valve,openBelow:25}}}),/disk failure/);assert.deepEqual(createStore(directory,'site-1').load(),document,'Interrupted writes preserve the last valid thresholds');
 }finally{assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep+'site1-threshold-test-'));fs.rmSync(directory,{recursive:true,force:true});}
}
console.log('PASS: heartbeat loss and reconnect authority; offline hysteresis; fresh data; manual overrides; capped watering and persistent lockout; disabled/missing/invalid rules; disk reload, atomic failed-write recovery and unchanged-heartbeat write suppression (disk checks run on Linux)');

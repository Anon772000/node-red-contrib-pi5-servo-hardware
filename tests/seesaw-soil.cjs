'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {readMoisture}=require('../seesaw-driver');
function device({id=0x55,raw=[500],writeBytes=2,readShort=false,failRead=false}={}) {
  const calls=[],delays=[];let closed=false,count=0,register;
  const bus={i2cWrite:async(address,length,buffer)=>{register=[...buffer];calls.push({address,register});return {bytesWritten:writeBytes};},
    i2cRead:async(address,length,buffer)=>{
      if(failRead)throw Error('Sensor disconnected');
      if(length===1)buffer[0]=id;else buffer.writeUInt16BE(raw[Math.min(count++,raw.length-1)]);
      return {bytesRead:readShort?0:length,buffer};
    },close:async()=>{closed=true;}};
  return {args:{i2c:{openPromisified:async n=>{assert.equal(n,1);return bus;}},delay:async ms=>delays.push(ms)},calls,delays,closed:()=>closed};
}
(async()=>{
 let d=device();assert.equal(await readMoisture(d.args),500);assert.deepEqual(d.calls,[{address:54,register:[0,1]},{address:54,register:[15,16]}]);assert.deepEqual(d.delays,[8,5,1]);assert.ok(d.closed());
 d=device({raw:[65535,5000,800]});assert.equal(await readMoisture(d.args),800);assert.equal(d.calls.length,4);assert.ok(d.closed());
 for(const [options,error] of [[{raw:[65535]},/valid capacitance/],[{id:0},/SAMD09/],[{writeBytes:1},/Incomplete/],[{readShort:true},/Incomplete/],[{failRead:true},/disconnected/]]) {
  d=device(options);await assert.rejects(readMoisture(d.args),error);assert.ok(d.closed());
 }
 const {validate}=require('../settings');
 const s={site:{id:'site-1',device:'Test',member:'Test',location:'Test'},gpio:{dht:4,valve:17,vent:18},servo:{closedPercent:0,openPercent:50},
  timing:{waterMaxSeconds:60,sensorSeconds:10,feedbackSeconds:1},dht:{type:22,enabled:true},soil:{enabled:true,source:'i2c-seesaw',i2cBus:1,i2cAddress:54,dryRaw:300,wetRaw:1000,estimated:true},
  mqtt:{host:'localhost',port:1883,tls:false,username:'test',password:'test',clientId:'test',keepaliveSeconds:15},offline:{enabled:true,hubTimeoutSeconds:45,cacheDirectory:'/tmp/site-reference-test'}};
 assert.equal(validate(s),s);
 for(const soil of [{...s.soil,i2cAddress:0x40},{...s.soil,i2cBus:0},{...s.soil,wetRaw:300},{...s.soil,source:'unknown'}])assert.throws(()=>validate({...s,soil}));
 assert.throws(()=>validate({...s,gpio:{...s.gpio,dht:2}}),/reserved/);
 assert.doesNotThrow(()=>validate({...s,soil:{enabled:true,adcPin:4,usbSerial:'TEST-SERIAL',baud:115200,dryRaw:0,wetRaw:2000,estimated:false}}));
 // A sample completing after Stop must not become telemetry in the next configuration.
 let Constructor,resolveRead,sent=[],handlers={},doneCalls=0;
 const exported={};
 const register=new Function('module','require',fs.readFileSync(__dirname+'/../seesaw-node.js','utf8')+'\nreturn module.exports;')(exported,()=>({readMoisture:()=>new Promise(resolve=>resolveRead=resolve)}));
 const flow={get:key=>key==='siteReady'?true:s};
 register({nodes:{registerType:(name,c)=>{assert.equal(name,'pi-site-seesaw-soil');Constructor=c;},createNode:node=>Object.assign(node,{on:(event,callback)=>handlers[event]=callback,context:()=>({flow}),status:()=>{},send:msg=>sent.push(msg)})}});
 new Constructor({});const pending=handlers.input({action:'read'},msg=>sent.push(msg),()=>doneCalls++);
 await handlers.input({action:'stop'},null,()=>doneCalls++);resolveRead(700);await pending;assert.equal(sent.length,0);assert.equal(doneCalls,2);
 const next=handlers.input({action:'read'},msg=>sent.push(msg),()=>doneCalls++);resolveRead(800);await next;assert.equal(sent[0].payload.soilRaw,800);
 console.log('PASS: Adafruit seesaw commands, big-endian capacitance, retry and identity checks, closed buses on failures, I2C settings, USB compatibility and stale-read suppression.');
})().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {readMoisture}=require('../mcp3008-driver');
function mock(raw,{fail=false,short=false,openFail=false}={}) {
 let closed=false,command,options;
 return {args:{spi:{openSync:(bus,device,config)=>{
  assert.equal(bus,0);assert.equal(device,0);options=config;if(openFail)throw Error('SPI disabled');
  return {transfer:(message,callback)=>{command=[...message[0].sendBuffer];
   message[0].receiveBuffer=short?Buffer.alloc(2):Buffer.from([0,(raw>>8)|0xf0,raw&255]);
   callback(fail?Error('SPI failed'):null,message);},closeSync:()=>{closed=true;}};
 }}},closed:()=>closed,command:()=>command,options:()=>options};
}
(async()=>{
 for(const raw of [0,1,511,512,1023]) {const m=mock(raw);assert.equal(await readMoisture(m.args),raw);assert.ok(m.closed());assert.deepEqual(m.command(),[1,128,0]);assert.equal(m.options().mode,0);}
 const channel7=mock(700);assert.equal(await readMoisture({...channel7.args,channel:7}),700);assert.deepEqual(channel7.command(),[1,240,0]);
 for(const options of [{fail:true},{short:true}]){const m=mock(0,options);await assert.rejects(readMoisture(m.args));assert.ok(m.closed());}
 await assert.rejects(readMoisture(mock(0,{openFail:true}).args),/disabled/);
 for(const args of [{channel:8},{deviceNumber:2},{busNumber:1},{speedHz:1}])await assert.rejects(readMoisture({...mock(0).args,...args}),/Invalid/);
 const validate=require('../settings').validate;
 const s={site:{id:'site-1',device:'Test',member:'Test',location:'Test'},gpio:{dht:4,valve:17,vent:18},servo:{closedPercent:0,openPercent:50},timing:{waterMaxSeconds:60,sensorSeconds:10,feedbackSeconds:1},dht:{type:22,enabled:true},soil:{enabled:true,source:'spi-mcp3008',spiBus:0,spiDevice:0,channel:0,speedHz:100000,dryRaw:0,wetRaw:1023,estimated:true},mqtt:{host:'localhost',port:1883,tls:false,username:'test',password:'test',clientId:'test',keepaliveSeconds:15},offline:{enabled:true,hubTimeoutSeconds:45,cacheDirectory:'/tmp/reference-test'}};
 assert.equal(validate(s),s);
 for(const soil of [{channel:8},{spiDevice:2},{spiBus:1},{speedHz:1},{wetRaw:1200}])assert.throws(()=>validate({...s,soil:{...s.soil,...soil}}));
 for(const pin of [8,9,10,11])assert.throws(()=>validate({...s,gpio:{...s.gpio,dht:pin}}),/conflict/);
 assert.doesNotThrow(()=>validate({...s,soil:{...s.soil,spiDevice:1},gpio:{...s.gpio,dht:8}}));
 assert.throws(()=>validate({...s,soil:{...s.soil,spiDevice:1},gpio:{...s.gpio,dht:7}}),/conflict/);
 let Constructor,resolveRead,sent=[],handlers={},doneCalls=0;
 const register=new Function('module','require',fs.readFileSync(__dirname+'/../mcp3008-node.js','utf8')+'\nreturn module.exports;')({},()=>({readMoisture:()=>new Promise(resolve=>resolveRead=resolve)}));
 const flow={get:key=>key==='siteReady'?true:s};
 register({nodes:{registerType:(name,c)=>{assert.equal(name,'pi-site-mcp3008-soil');Constructor=c;},createNode:node=>Object.assign(node,{on:(event,callback)=>handlers[event]=callback,context:()=>({flow}),status:()=>{},send:msg=>sent.push(msg)})}});
 new Constructor({});const pending=handlers.input({action:'read'},msg=>sent.push(msg),()=>doneCalls++);
 await handlers.input({action:'stop'},null,()=>doneCalls++);resolveRead(500);await pending;assert.equal(sent.length,0);assert.equal(doneCalls,2);
 const next=handlers.input({action:'read'},msg=>sent.push(msg),()=>doneCalls++);resolveRead(800);await next;assert.equal(sent[0].payload.soilRaw,800);assert.equal(sent[0].payload.sensor,'XC4604');
 console.log('PASS: MCP3008 protocol/endpoints, channels, transfer failures/cleanup, settings and GPIO conflicts, cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});

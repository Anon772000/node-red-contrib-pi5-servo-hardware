'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile,execFileSync,spawn,fork}=require('node:child_process');
const {validate}=require('./settings');
module.exports=function(RED) {
  const CA_PATH=path.join(RED.settings.userDir,'certs','pi5-servo-ca.crt');
  function settings(node) {
    if(!node.context().flow.get('siteReady'))throw Error('Apply Site settings first');
    return node.context().flow.get('activeSiteSettings');
  }
  function failure(node,error,msg,done) {
    node.status({fill:'red',shape:'ring',text:error.message});
    if(done)done(error);else node.error(error,msg);
  }
  function Prepare(config) {
    RED.nodes.createNode(this,config);const node=this;let lastSignature,busy=false;
    node.on('input',(msg,send,done)=>{
      send=send||node.send.bind(node);
      const candidate=node.context().flow.get('siteSettings'),signature=JSON.stringify(candidate);
      if(busy||signature===lastSignature){if(done)done();return;}
      lastSignature=signature;node.context().flow.set('siteReady',false);
      send([null,null,{action:'stop'}]);
      let s;
      try {
        const old=node.context().flow.get('activeSiteSettings');
        if(old){
          execFileSync('pinctrl',['set',String(old.gpio.valve),'op','dl'],{timeout:1000});
          require('./hardware').createDriver({gpio:old.gpio.vent}).set(old.servo.closedPercent);
        }
        s=validate(candidate);
        if(s.mqtt.tls){fs.mkdirSync(path.dirname(CA_PATH),{recursive:true});fs.writeFileSync(CA_PATH,s.mqtt.caPem,{mode:0o600});}
        execFileSync('pinctrl',['set',String(s.gpio.valve),'op','dl'],{timeout:1000});
      }catch(e){failure(node,e,msg,done);return;}
      busy=true;
      execFile('sudo',['-n','/usr/bin/node','/usr/local/lib/pi5-servo-pwm-setup.cjs','configure',String(s.gpio.vent),String(s.servo.closedPercent)],{timeout:15000},error=>{
        busy=false;
        if(error){failure(node,Error('PWM setup failed; site remains stopped'),msg,done);return;}
        node.context().flow.set('activeSiteSettings',JSON.parse(JSON.stringify(s)));node.context().flow.set('siteReady',true);
        const broker={broker:s.mqtt.host,port:s.mqtt.port,clientid:s.mqtt.clientId,username:s.mqtt.username,password:s.mqtt.password,
          usetls:s.mqtt.tls,verifyservercert:true,force:true,cleansession:true,protocolVersion:4,keepalive:s.mqtt.keepaliveSeconds};
        send([{action:'connect',broker},{action:'subscribe',topic:[{topic:'sites/'+s.site.id+'/valve/set',qos:1},{topic:'sites/'+s.site.id+'/vent/set',qos:1},{topic:'sites/'+s.site.id+'/config',qos:1}]},{action:'start'}]);
        node.status({fill:'green',shape:'dot',text:s.site.id+' settings applied'});if(done)done();
      });
    });
  }
  RED.nodes.registerType('pi-site-prepare',Prepare);
  function GPIO(config) {
    RED.nodes.createNode(this,config);const node=this;let lastPin;
    function closePin(){
      const active=node.context().flow.get('activeSiteSettings');
      // Prepare already closed the previous valve. Do not overwrite a pin
      // that has since been reassigned to the servo or temperature sensor.
      if(lastPin!==undefined&&(!active||active.gpio.valve===lastPin))execFileSync('pinctrl',['set',String(lastPin),'op','dl'],{timeout:1000});
    }
    node.on('input',(msg,send,done)=>{
      send=send||node.send.bind(node);
      try {
        const s=settings(node),pin=s.gpio.valve;
        if(config.mode==='write') {
          if(msg.payload!==0&&msg.payload!==1)throw Error('GPIO payload must be 0 or 1');
          if(lastPin!==undefined&&lastPin!==pin)closePin();lastPin=pin;
          execFileSync('pinctrl',['set',String(pin),'op',msg.payload?'dh':'dl'],{timeout:1000});
        }
        const actual=execFileSync('pinctrl',['get',String(pin)],{encoding:'utf8',timeout:1000});
        const match=new RegExp('^\\s*'+pin+':\\s+op\\b[^|]*\\|\\s*(hi|lo)\\b').exec(actual);
        if(!match)throw Error('Valve GPIO readback unavailable');
        node.status({fill:'green',shape:'dot',text:'GPIO'+pin+' '+match[1]});
        send({topic:'sites/'+s.site.id+'/valve/state',payload:match[1]==='hi',qos:'1',retain:false});if(done)done();
      }catch(e){failure(node,e,msg,done);}
    });
    node.on('close',()=>{try{if(config.mode==='write')closePin();}catch(e){node.warn('Could not close valve GPIO');}});
  }
  RED.nodes.registerType('pi-site-gpio',GPIO);
  function DHT(config) {
    RED.nodes.createNode(this,config);const node=this;let child;
    node.on('input',(msg,send,done)=>{
      send=send||node.send.bind(node);let s;
      if(msg.action==='stop'){child?.kill();if(done)done();return;}
      try{s=settings(node);}catch(e){failure(node,e,msg,done);return;}
      if(!s.dht.enabled||child){if(done)done();return;}
      child=fork(path.join(__dirname,'read-dht.cjs'),[String(s.dht.type),String(s.gpio.dht)],{stdio:['ignore','ignore','ignore','ipc']});
      let received=false;
      const timeout=setTimeout(()=>child?.kill(),10000);
      child.on('message',r=>{
        received=true;
        if(!node.context().flow.get('siteReady')||node.context().flow.get('activeSiteSettings')!==s)return;
        if(r.isValid===false||!Number.isFinite(r.temperature)||!Number.isFinite(r.humidity)||r.temperature<-40||r.temperature>80||r.humidity<0||r.humidity>100){node.status({fill:'yellow',shape:'ring',text:'No valid DHT reading'});return;}
        node.status({fill:'green',shape:'dot',text:r.temperature.toFixed(1)+' C / '+r.humidity.toFixed(1)+'%'});
        send({topic:'sites/'+s.site.id+'/telemetry',payload:{...s.site,sensor:'DHT'+s.dht.type,temperature:r.temperature,humidity:r.humidity,timestamp:new Date().toISOString()}});
      });
      child.on('error',()=>node.status({fill:'red',shape:'ring',text:'DHT reader could not start'}));
      child.on('exit',()=>{clearTimeout(timeout);child=null;if(!received)node.status({fill:'yellow',shape:'ring',text:'DHT reading unavailable'});if(done)done();});
    });
    node.on('close',()=>child?.kill());
  }
  RED.nodes.registerType('pi-site-dht',DHT);
  function USB(config) {
    RED.nodes.createNode(this,config);const node=this;let child,generation=0;
    node.on('input',(msg,send,done)=>{
      send=send||node.send.bind(node);let s;
      if(msg.action==='stop'){++generation;child?.kill();child=null;if(done)done();return;}
      try{s=settings(node);}catch(e){failure(node,e,msg,done);return;}
      const current=++generation;if(child)child.kill();child=null;
      if(s.soil.enabled) {
        child=spawn('python3',['-u',path.join(__dirname,'tools','heltec-soil-reader.py'),'--usb-serial',s.soil.usbSerial,'--baud',String(s.soil.baud)],{stdio:['ignore','pipe','pipe']});
        child.stdout.on('data',data=>{if(current===generation)send({payload:data.toString('utf8')});});
        child.stderr.on('data',data=>{if(current===generation)node.status({fill:'yellow',shape:'ring',text:data.toString().trim().slice(0,80)});});
        child.on('error',()=>node.status({fill:'red',shape:'ring',text:'USB soil reader could not start'}));
        child.on('exit',()=>{if(current===generation){child=null;node.status({fill:'red',shape:'ring',text:'USB soil reader stopped'});}});
      }else node.status({fill:'grey',shape:'ring',text:'Soil disabled'});
      if(done)done();
    });
    node.on('close',(removed,done)=>{++generation;if(!child){done();return;}const old=child;child=null;const timer=setTimeout(()=>{old.kill('SIGKILL');done();},2000);old.once('exit',()=>{clearTimeout(timer);done();});old.kill();});
  }
  RED.nodes.registerType('pi-site-usb-soil',USB);
};

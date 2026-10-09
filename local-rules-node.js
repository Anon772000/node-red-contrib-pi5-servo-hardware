'use strict';
const {createStore,validateDocument}=require('./threshold-store'),{OfflineRules}=require('./offline-rules');
module.exports=function(RED){
  function LocalRulesNode(config){
    RED.nodes.createNode(this,config);const node=this;let model,store,timer,connected=false;
    function blocked(value){try{store.saveBlocked(value);}catch(error){node.error('Could not save local watering lockout: '+error.message);}}
    function show(){
      const mode=model?.mode()??'waiting';
      node.status({fill:mode==='hub'?'green':'yellow',shape:mode==='hub'?'dot':'ring',text:mode==='hub'?'Hub control · thresholds saved':mode==='offline'?'Offline · saved thresholds':'Waiting for hub thresholds'});
    }
    function tick(){try{model?.tick();show();}catch(error){node.error('Local threshold control: '+error.message);}}
    function stop(){clearInterval(timer);timer=null;if(model?.waterSince!==null&&model?.waterSince!==undefined)model.block(true);model=null;}
    node.on('input',(msg,send,done)=>{
      send=send||node.send.bind(node);
      try {
        if(msg.action==='stop'){stop();if(done)done();return;}
        if(msg.status){connected=['connected','node-red:common.status.connected'].includes(msg.status.text);model?.broker(connected);tick();if(done)done();return;}
        if(msg.action==='start'){
          stop();const s=node.context().flow.get('activeSiteSettings');
          store=createStore(s.offline.cacheDirectory,s.site.id);let saved=null,waterBlocked=false;
          try{saved=store.load();}catch(error){node.warn('Stored hub thresholds are invalid; waiting for a valid update');}
          try{waterBlocked=store.loadBlocked();}catch(error){waterBlocked=true;node.warn('Invalid watering lockout; keeping the valve blocked until a wet reading');}
          model=new OfflineRules({siteId:s.site.id,hubTimeoutSeconds:s.offline.hubTimeoutSeconds,localMaxSeconds:s.timing.waterMaxSeconds,enabled:s.offline.enabled,
            blocked:waterBlocked,persistBlocked:blocked,emit:message=>node.send(message)});
          if(saved)model.configure(saved);model.broker(connected);node.context().flow.set('siteThresholds',saved);
          timer=setInterval(tick,1000);show();if(done)done();return;
        }
        if(!model||!node.context().flow.get('siteReady')){if(done)done();return;}
        const prefix='sites/'+model.siteId+'/';let payload=msg.payload;
        if(Buffer.isBuffer(payload))payload=payload.toString('utf8');
        if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch{}}
        if(msg.topic===prefix+'config'){
          validateDocument(payload,model.siteId);
          if(!msg.retain)model.hubAlive();
          store.save(payload);model.configure(payload);node.context().flow.set('siteThresholds',payload);
        }else if(msg.topic===prefix+'telemetry')model.reading(payload);
        else if(msg.topic===prefix+'valve/state'||msg.topic===prefix+'vent/state')model.feedback(msg.topic===prefix+'valve/state'?'valve':'vent',payload);
        else if(!msg.retain&&(msg.topic===prefix+'valve/set'||msg.topic===prefix+'vent/set')&&[true,false,'open','closed','true','false'].includes(payload))model.hubAlive();
        tick();if(done)done();
      }catch(error){node.error('Hub threshold cache: '+error.message);if(done)done();}
    });
    node.on('close',()=>stop());
  }
  RED.nodes.registerType('pi-site-local-rules',LocalRulesNode);
};

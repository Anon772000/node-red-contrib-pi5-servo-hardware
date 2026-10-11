'use strict';
module.exports=function(RED) {
  function SeesawSoil(config) {
    RED.nodes.createNode(this,config);const node=this;let busy=false,generation=0,closed=false;
    node.on('input',async(msg,send,done)=>{
      send=send||node.send.bind(node);done=done||(()=>{});
      if(msg.action==='stop'){generation++;done();return;}
      if(msg.action!=='read'||busy||closed){done();return;}
      const flow=node.context().flow,s=flow.get('activeSiteSettings');
      if(!flow.get('siteReady')||!s?.soil.enabled){done();return;}
      if(s.soil.source!=='i2c-seesaw'){done(Error('Select the I2C STEMMA soil source in Site settings'));return;}
      busy=true;const current=generation;
      try {
        const raw=await require('./seesaw-driver').readMoisture({busNumber:s.soil.i2cBus,address:s.soil.i2cAddress});
        if(!closed&&current===generation&&flow.get('siteReady')&&flow.get('activeSiteSettings')===s) {
          node.status({fill:'green',shape:'dot',text:'raw '+raw+' / 0x'+s.soil.i2cAddress.toString(16)});
          send({payload:{sensor:'Adafruit STEMMA I2C',soilRaw:raw}});
        }
        done();
      }catch(error){
        if(!closed&&current===generation){node.status({fill:'red',shape:'ring',text:error.message});done(error);}else done();
      }finally{busy=false;}
    });
    node.on('close',()=>{closed=true;generation++;});
  }
  RED.nodes.registerType('pi-site-seesaw-soil',SeesawSoil);
};

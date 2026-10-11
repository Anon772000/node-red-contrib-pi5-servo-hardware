'use strict';
module.exports=function(RED) {
  function Mcp3008Soil(config) {
    RED.nodes.createNode(this,config);const node=this;let busy=false,generation=0,closed=false;
    node.on('input',async(msg,send,done)=>{
      send=send||node.send.bind(node);done=done||(()=>{});
      if(msg.action==='stop'){generation++;done();return;}
      if(msg.action!=='read'||busy||closed){done();return;}
      const flow=node.context().flow,s=flow.get('activeSiteSettings');
      if(!flow.get('siteReady')||!s?.soil.enabled){done();return;}
      if(s.soil.source!=='spi-mcp3008'){done(Error('Select the MCP3008 soil source in Site settings'));return;}
      busy=true;const current=generation;
      try {
        const raw=await require('./mcp3008-driver').readMoisture({busNumber:s.soil.spiBus,deviceNumber:s.soil.spiDevice,channel:s.soil.channel,speedHz:s.soil.speedHz});
        if(!closed&&current===generation&&flow.get('siteReady')&&flow.get('activeSiteSettings')===s) {
          node.status({fill:'green',shape:'dot',text:'raw '+raw+' / CH'+s.soil.channel});
          send({payload:{sensor:'XC4604',soilRaw:raw}});
        }
        done();
      }catch(error){
        if(!closed&&current===generation){node.status({fill:'red',shape:'ring',text:error.message});done(error);}else done();
      }finally{busy=false;}
    });
    node.on('close',()=>{closed=true;generation++;});
  }
  RED.nodes.registerType('pi-site-mcp3008-soil',Mcp3008Soil);
};

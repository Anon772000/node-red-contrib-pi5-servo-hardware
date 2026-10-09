'use strict';
module.exports=function(RED) {
  const {createDriver}=require('./hardware');
  function ServoNode(config) {
    RED.nodes.createNode(this,config);
    const node=this;
    function show(value) {node.status({fill:'green',shape:'dot',text:value.positionPercent+'% · '+value.pulseWidthUs+'us'});}
    const getDriver=()=>createDriver({gpio:config.useSettings?node.context().flow.get('activeSiteSettings')?.gpio.vent:18});
    if(!config.useSettings)try{show(getDriver().status());}catch(error){node.status({fill:'red',shape:'ring',text:error.message});}
    node.on('input',(msg,send,done)=>{
      send=send||node.send.bind(node);
      try {
        if(config.useSettings&&!node.context().flow.get('siteReady'))throw Error('Site settings have not been applied');
        const driver=getDriver();
        msg.payload=config.mode==='read'?driver.status():driver.set(msg.payload);
        msg.topic='servo/GPIO'+msg.payload.gpioBCM;show(msg.payload);send(msg);if(done)done();
      }catch(error){node.status({fill:'red',shape:'ring',text:error.message});if(done)done(error);else node.error(error,msg);}
    });
    node.on('close',()=>node.status({}));
  }
  RED.nodes.registerType('pi5-servo-pwm',ServoNode);
};

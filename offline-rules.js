'use strict';
const {validateDocument}=require('./threshold-store');
class OfflineRules {
  constructor({siteId,hubTimeoutSeconds,localMaxSeconds,enabled=true,now=Date.now,emit,persistBlocked=()=>{},blocked=false}){
    Object.assign(this,{siteId,hubTimeoutSeconds,localMaxSeconds,enabled,now,emit,persistBlocked});
    this.document=null;this.connected=false;this.lastHubSeen=null;this.readings={};this.positions={};this.pending={};this.waterSince=null;this.waterBlocked=blocked;
  }
  configure(document){this.document=validateDocument(document,this.siteId);}
  hubAlive(){this.lastHubSeen=this.now();this.pending={};}
  broker(connected){this.connected=connected;if(!connected)this.lastHubSeen=null;}
  mode(){return !this.document?'waiting':this.connected&&this.lastHubSeen!==null&&this.now()-this.lastHubSeen<this.hubTimeoutSeconds*1000?'hub':'offline';}
  maximum(){return Math.min(this.localMaxSeconds,this.document?.settings.valve.maxOpenSeconds??this.localMaxSeconds);}
  block(value){if(this.waterBlocked===value)return;this.persistBlocked(value);this.waterBlocked=value;}
  reading(payload){
    for(const metric of ['temperature','humidity','soilMoisture']){
      const value=payload?.[metric];
      if(typeof value!=='number'||!Number.isFinite(value)||value<(metric==='temperature'?-40:0)||value>(metric==='temperature'?80:100))continue;
      this.readings[metric]={value,time:this.now(),estimated:metric==='soilMoisture'&&payload.soilMoistureEstimated===true};
    }
  }
  feedback(actuator,open){
    if(!['valve','vent'].includes(actuator)||typeof open!=='boolean')return;
    if(actuator==='valve'){
      if(open&&this.waterSince===null)this.waterSince=this.now();
      if(!open&&this.waterSince!==null){if(this.now()-this.waterSince>=this.maximum()*1000)this.block(true);this.waterSince=null;}
    }
    this.positions[actuator]={open,time:this.now()};
    if(this.pending[actuator]?.open===open)delete this.pending[actuator];
  }
  fresh(value){return !!value&&this.now()-value.time<this.document.settings.staleAfterSeconds*1000;}
  request(actuator,open){
    if(this.positions[actuator]?.open===open&&!this.pending[actuator])return;
    const pending=this.pending[actuator];
    if(pending?.open===open&&this.now()-pending.time<5000)return;
    if(pending&&!(actuator==='valve'&&!open))return;
    this.pending[actuator]={open,time:this.now()};
    this.emit({topic:'sites/'+this.siteId+'/'+actuator+'/set',payload:open,local:true});
  }
  tick(){
    if(!this.document)return;
    const s=this.document.settings,soil=this.readings.soilMoisture;
    if(this.fresh(soil)&&(!soil.estimated||s.allowEstimatedSoilAutomation)&&s.valve.closeAbove!=null&&soil.value>=s.valve.closeAbove)this.block(false);
    if(this.waterSince!==null&&this.now()-this.waterSince>=this.maximum()*1000){this.block(true);this.request('valve',false);}
    if(!this.enabled||this.mode()!=='offline')return;
    if(!s.commissioned||!s.automationEnabled){if(this.positions.valve?.open||this.pending.valve?.open)this.request('valve',false);return;}
    const override=actuator=>(this.document.overrides[actuator]??0)>this.now();
    const validSoil=s.soilMoistureUnit==='%'&&s.valve.maxOpenSeconds!==null&&this.fresh(soil)&&(!soil.estimated||s.allowEstimatedSoilAutomation);
    if(!validSoil){if(this.positions.valve?.open||this.pending.valve?.open)this.request('valve',false);}
    else if(!override('valve')&&this.fresh(this.positions.valve)&&s.valve.openBelow!=null){
      if(soil.value<s.valve.openBelow&&!this.waterBlocked)this.request('valve',true);
      else if(soil.value>=s.valve.closeAbove)this.request('valve',false);
    }
    if(override('vent')||!this.fresh(this.positions.vent))return;
    const rules=[['temperature',s.vent.temperatureOpenAbove,s.vent.temperatureCloseBelow],['humidity',s.vent.humidityOpenAbove,s.vent.humidityCloseBelow]].filter(([,high,low])=>high!=null&&low!=null);
    const valid=rules.filter(([metric])=>this.fresh(this.readings[metric]));
    const open=s.vent.openWhen==='all'?rules.length&&valid.length===rules.length&&valid.every(([metric,high])=>this.readings[metric].value>=high):valid.some(([metric,high])=>this.readings[metric].value>=high);
    if(open)this.request('vent',true);
    else if(rules.length&&valid.length===rules.length&&valid.every(([metric,,low])=>this.readings[metric].value<=low))this.request('vent',false);
  }
}
module.exports={OfflineRules};

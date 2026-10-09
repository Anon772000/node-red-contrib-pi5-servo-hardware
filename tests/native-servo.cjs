const assert=require('node:assert/strict'),path=require('node:path');
const {createDriver}=require('../hardware');
let fields={npwm:'4',period:'20000000',duty_cycle:'1500000',enable:'1'},writes=[];
const fs={readdirSync:()=>['pwmchip6','pwmchip0'],realpathSync:p=>p.endsWith('6')?'/device/1f00098000.pwm/pwm/pwmchip6':'/device/1f0009c000.pwm/pwm/pwmchip0',
 readFileSync:p=>fields[path.basename(p)],writeFileSync:(p,value)=>{writes.push({p,value});fields[path.basename(p)]=value;}};
const driver=createDriver({fs,execFileSync:()=> '18: a3 | lo // GPIO18 = PWM0_CHAN2'});
for(const [value,pulse] of [[0,1000],[50,1500],[100,2000],['25',1250]]){
 assert.equal(driver.set(value).pulseWidthUs,pulse);assert.equal(driver.status().positionPercent,Number(value));
}
assert.ok(writes.every(w=>w.p===path.join('/sys/class/pwm','pwmchip6','pwm2','duty_cycle')),'Only the correct PWM channel is written');
for(const value of [true,false,null,undefined,'',[],{},-1,101,NaN,Infinity,'50; reboot']){
 const count=writes.length;assert.throws(()=>driver.set(value),/0–100/);assert.equal(writes.length,count);
}
fields.period='1250000';const count=writes.length;assert.throws(()=>driver.set(50),/50Hz/);assert.equal(writes.length,count);
fields.period='20000000';assert.throws(()=>createDriver({fs,execFileSync:()=> 'GPIO18 input'}).set(50),/GPIO18/);
for(const [gpio,channel] of [[12,0],[13,1],[18,2],[19,3]]){
 const d=createDriver({fs,gpio,execFileSync:(command,args)=>{assert.equal(args[1],String(gpio));return 'PWM0_CHAN'+channel;}});
 assert.equal(d.set(50).channel,channel);assert.equal(writes.at(-1).p,path.join('/sys/class/pwm','pwmchip6','pwm'+channel,'duty_cycle'));
}
assert.throws(()=>createDriver({fs,gpio:27}),/hardware PWM/);
console.log('PASS: native JavaScript servo bounds, pulse mapping, real readback, invalid input rejection, correct controller/channel and no Python');

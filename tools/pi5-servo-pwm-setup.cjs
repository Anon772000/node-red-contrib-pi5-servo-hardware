'use strict';
// Root-owned Pi 5 PWM0 setup. Never touches the PWM1 fan controller.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root='/sys/class/pwm',period=20000000,stateFile='/var/lib/pi5-servo-pwm/settings.json';
const pins={12:{channel:0,mux:'a0'},13:{channel:1,mux:'a0'},18:{channel:2,mux:'a3'},19:{channel:3,mux:'a3'}};
function stored(){return fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{gpio:18,closedPercent:0};}
function chipPath() {
  const chips=fs.readdirSync(root).filter(n=>/^pwmchip\d+$/.test(n)).map(n=>path.join(root,n))
    .filter(p=>fs.realpathSync(p).includes('1f00098000.pwm'));
  if(chips.length!==1 || Number(fs.readFileSync(path.join(chips[0],'npwm'),'utf8'))!==4)throw Error('Pi 5 PWM0 not ready');
  return chips[0];
}
const write=(file,value)=>fs.writeFileSync(file,String(value));
async function main() {
  const action=process.argv[2];
  if(action==='stop'){write(path.join(chipPath(),'pwm'+pins[stored().gpio].channel,'enable'),0);return;}
  if(action!=='setup'&&action!=='configure')throw Error('Expected setup, configure or stop');
  const previous=stored(),s=action==='configure'?{gpio:Number(process.argv[3]),closedPercent:Number(process.argv[4])}:previous;
  if(!pins[s.gpio]||!Number.isFinite(s.closedPercent)||s.closedPercent<0||s.closedPercent>100)throw Error('Invalid servo pin or closed position');
  const channelNumber=pins[s.gpio].channel;
  try{chipPath();}catch{execFileSync('dtoverlay',['pwm'],{timeout:10000});}
  const deadline=Date.now()+10000;let chip;
  while(!chip){try{chip=chipPath();}catch(error){if(Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,200));}}
  const channel=path.join(chip,'pwm'+channelNumber);
  if(previous.gpio!==s.gpio){
    const old=path.join(chip,'pwm'+pins[previous.gpio].channel);
    if(fs.existsSync(old))write(path.join(old,'enable'),0);
    execFileSync('pinctrl',['set',String(previous.gpio),'ip','pn'],{timeout:1000});
  }
  if(!fs.existsSync(channel))write(path.join(chip,'export'),channelNumber);
  write(path.join(channel,'enable'),0);write(path.join(channel,'duty_cycle'),0);
  write(path.join(channel,'period'),period);write(path.join(channel,'polarity'),'normal');
  execFileSync('pinctrl',['set',String(s.gpio),pins[s.gpio].mux],{timeout:1000});
  write(path.join(channel,'duty_cycle'),Math.round(1000000+s.closedPercent*10000));write(path.join(channel,'enable'),1);
  const group=Number(execFileSync('getent',['group','gpio'],{encoding:'utf8',timeout:1000}).trim().split(':')[2]);
  if(!Number.isInteger(group) || group<0)throw Error('gpio group missing');
  const lock='/run/pi5-servo-pwm/command.lock';fs.mkdirSync(path.dirname(lock),{recursive:true});
  fs.closeSync(fs.openSync(lock,'a'));fs.chownSync(lock,0,group);fs.chmodSync(lock,0o660);
  for(const name of ['duty_cycle','enable']){fs.chownSync(path.join(channel,name),0,group);fs.chmodSync(path.join(channel,name),0o660);}
  for(const name of ['period','polarity'])fs.chmodSync(path.join(channel,name),0o644);
  fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile,JSON.stringify(s)+'\n',{mode:0o600});
  console.log(JSON.stringify({gpioBCM:s.gpio,channel:channelNumber,frequencyHz:50,pulseWidthUs:1000+s.closedPercent*10,enabled:true,hardwarePWM:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

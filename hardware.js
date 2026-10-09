'use strict';
const path=require('node:path');
function createDriver({fs=require('node:fs'),execFileSync=require('node:child_process').execFileSync,pwmRoot='/sys/class/pwm',gpio=18}={}) {
  const pins={12:{channel:0,physical:32},13:{channel:1,physical:33},18:{channel:2,physical:12},19:{channel:3,physical:35}};
  if(!pins[gpio])throw Error('Pi 5 hardware PWM supports GPIO12, 13, 18 or 19');
  const {channel:channelNumber,physical}=pins[gpio];
  const read=file=>Number(fs.readFileSync(file,'utf8').trim());
  function channelPath() {
    const chips=fs.readdirSync(pwmRoot).filter(name=>/^pwmchip\d+$/.test(name))
      .map(name=>path.join(pwmRoot,name)).filter(chip=>fs.realpathSync(chip).includes('1f00098000.pwm'));
    if(chips.length!==1 || read(path.join(chips[0],'npwm'))!==4)throw Error('Pi 5 PWM0 is not ready');
    return path.join(chips[0],'pwm'+channelNumber);
  }
  function status() {
    const channel=channelPath(),period=read(path.join(channel,'period')),duty=read(path.join(channel,'duty_cycle'));
    const enabled=read(path.join(channel,'enable'))===1;
    const mux=execFileSync('pinctrl',['get',String(gpio)],{encoding:'utf8',timeout:1000});
    if(!enabled || period!==20000000 || !Number.isFinite(duty) || duty<1000000 || duty>2000000 || !mux.includes('PWM0_CHAN'+channelNumber))
      throw Error('GPIO'+gpio+' must use 50Hz PWM0 channel'+channelNumber+' with 1–2ms pulses');
    return {gpioBCM:gpio,physicalPin:physical,channel:channelNumber,frequencyHz:50,pulseWidthUs:duty/1000,
      positionPercent:(duty-1000000)/10000,dutyPercent:duty/period*100,enabled:true,hardwarePWM:true};
  }
  function set(value) {
    if((typeof value!=='number' && typeof value!=='string') || (typeof value==='string' && !value.trim()))
      throw Error('Servo position must be 0–100');
    const percent=Number(value);
    if(!Number.isFinite(percent) || percent<0 || percent>100)throw Error('Servo position must be 0–100');
    status();
    fs.writeFileSync(path.join(channelPath(),'duty_cycle'),String(Math.round(1000000+percent*10000)));
    return status();
  }
  return {status,set};
}
module.exports={createDriver};

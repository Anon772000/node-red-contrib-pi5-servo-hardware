'use strict';
const GPIO_PINS=[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27];
function validate(s) {
  const fail=message=>{throw Error(message);};
  if(!s || !/^site-[1-9]\d*$/.test(s.site?.id||''))fail('Set a valid site ID');
  if(![s.site.device,s.site.member,s.site.location].every(v=>typeof v==='string'&&v.trim()))fail('Set the site details');
  if(!GPIO_PINS.includes(s.gpio?.valve)||!GPIO_PINS.includes(s.gpio?.dht)||![12,13,18,19].includes(s.gpio?.vent))fail('Use BCM GPIO numbers; vent PWM supports 12, 13, 18 or 19');
  if(new Set(Object.values(s.gpio)).size!==3)fail('Each Pi device needs a different GPIO');
  if(![s.servo?.closedPercent,s.servo?.openPercent].every(v=>Number.isFinite(v)&&v>=0&&v<=100)||s.servo.closedPercent===s.servo.openPercent)fail('Servo positions must be distinct numbers from 0 to 100');
  if(!Number.isFinite(s.timing?.waterMaxSeconds)||s.timing.waterMaxSeconds<1||s.timing.waterMaxSeconds>600)fail('Water cutoff must be 1 to 600 seconds');
  if(!Number.isFinite(s.timing.sensorSeconds)||s.timing.sensorSeconds<2||s.timing.sensorSeconds>3600||!Number.isFinite(s.timing.feedbackSeconds)||s.timing.feedbackSeconds<1||s.timing.feedbackSeconds>60)fail('Check sensor and feedback intervals');
  if(![11,22].includes(s.dht?.type)||typeof s.dht.enabled!=='boolean')fail('Select DHT11 or DHT22, and enabled true/false');
  if(typeof s.soil?.enabled!=='boolean'||!Number.isInteger(s.soil.adcPin)||s.soil.adcPin<0||s.soil.adcPin>48||![s.soil.dryRaw,s.soil.wetRaw].every(v=>Number.isFinite(v)&&v>=0&&v<=4095)||Math.abs(s.soil.dryRaw-s.soil.wetRaw)<50||typeof s.soil.estimated!=='boolean')fail('Check soil calibration and Heltec ADC pin');
  if(!/^[A-Za-z0-9:_-]{1,80}$/.test(s.soil.usbSerial||'')||![9600,19200,38400,57600,115200].includes(s.soil.baud))fail('Check Heltec USB serial and baud rate');
  if(typeof s.mqtt?.host!=='string'||!/^[A-Za-z0-9.:-]+$/.test(s.mqtt.host)||!Number.isInteger(s.mqtt.port)||s.mqtt.port<1||s.mqtt.port>65535||typeof s.mqtt.tls!=='boolean'||typeof s.mqtt.username!=='string'||!s.mqtt.username||typeof s.mqtt.password!=='string'||!s.mqtt.password||typeof s.mqtt.clientId!=='string'||!s.mqtt.clientId)fail('Check MQTT connection settings');
  if(s.mqtt.tls&&!(typeof s.mqtt.caPem==='string'&&s.mqtt.caPem.includes('-----BEGIN CERTIFICATE-----')))fail('Set the MQTT CA certificate');
  if(!Number.isInteger(s.mqtt.keepaliveSeconds)||s.mqtt.keepaliveSeconds<5||s.mqtt.keepaliveSeconds>120)fail('MQTT keepalive must be 5 to 120 seconds');
  if(typeof s.offline?.enabled!=='boolean'||!Number.isFinite(s.offline.hubTimeoutSeconds)||s.offline.hubTimeoutSeconds<20||s.offline.hubTimeoutSeconds>300||typeof s.offline.cacheDirectory!=='string'||!s.offline.cacheDirectory.startsWith('/'))fail('Check offline control timeout and absolute cache directory');
  return s;
}
module.exports={validate,GPIO_PINS};

'use strict';
// Protocol: Adafruit_CircuitPython_seesaw.seesaw.Seesaw.moisture_read (channel 0).
// https://github.com/adafruit/Adafruit_CircuitPython_seesaw/blob/main/adafruit_seesaw/seesaw.py
async function readMoisture({busNumber=1,address=0x36,i2c=require('i2c-bus'),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if(busNumber!==1||!Number.isInteger(address)||address<0x36||address>0x39)throw Error('Invalid STEMMA I2C bus or address');
  const bus=await i2c.openPromisified(busNumber);
  async function readRegister(base,offset,length,waitMs) {
    const command=Buffer.from([base,offset]);
    const write=await bus.i2cWrite(address,command.length,command);
    if(write.bytesWritten!==command.length)throw Error('Incomplete STEMMA I2C command');
    await delay(waitMs);
    const buffer=Buffer.alloc(length),read=await bus.i2cRead(address,length,buffer);
    if(read.bytesRead!==length)throw Error('Incomplete STEMMA I2C reading');
    return buffer;
  }
  try {
    const id=(await readRegister(0x00,0x01,1,8))[0];
    if(id!==0x55)throw Error('Expected an Adafruit STEMMA SAMD09 soil sensor');
    for(let attempt=0;attempt<5;attempt++) {
      const raw=(await readRegister(0x0f,0x10,2,5)).readUInt16BE();
      await delay(1);
      if(raw<=4095)return raw;
    }
    throw Error('STEMMA soil sensor did not return a valid capacitance reading');
  } finally {await bus.close();}
}
module.exports={readMoisture};

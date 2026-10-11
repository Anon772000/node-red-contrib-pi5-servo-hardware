'use strict';
// MCP3008 single-ended, 10-bit conversion (Microchip DS21295D section 5).
// https://www.microchip.com/content/dam/mchp/documents/APID/ProductDocuments/DataSheets/21295d.pdf
async function readMoisture({busNumber=0,deviceNumber=0,channel=0,speedHz=100000,spi=require('spi-device')}={}) {
  if(busNumber!==0||![0,1].includes(deviceNumber)||!Number.isInteger(channel)||channel<0||channel>7||!Number.isInteger(speedHz)||speedHz<10000||speedHz>1000000)throw Error('Invalid MCP3008 SPI settings');
  const device=spi.openSync(busNumber,deviceNumber,{mode:0,bitsPerWord:8,maxSpeedHz:speedHz});
  try {
    const message=[{sendBuffer:Buffer.from([1,(8+channel)<<4,0]),receiveBuffer:Buffer.alloc(3),byteLength:3,speedHz}];
    const result=await new Promise((resolve,reject)=>device.transfer(message,(error,value)=>error?reject(error):resolve(value)));
    const frame=result?.[0];
    if(frame?.byteLength!==3||!Buffer.isBuffer(frame.receiveBuffer)||frame.receiveBuffer.length!==3)throw Error('Incomplete MCP3008 SPI reading');
    return ((frame.receiveBuffer[1]&3)<<8)|frame.receiveBuffer[2];
  } finally {device.closeSync();}
}
module.exports={readMoisture};

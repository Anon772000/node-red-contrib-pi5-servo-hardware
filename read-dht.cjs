'use strict';
// Run the existing native DHT driver outside Node-RED's event loop.
try {
  const sensor=require('node-dht-sensor');
  process.send(sensor.read(Number(process.argv[2]),Number(process.argv[3])),()=>process.exit());
}catch(error){process.send({isValid:false},()=>process.exit(1));}

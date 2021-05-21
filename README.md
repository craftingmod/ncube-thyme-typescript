# ncube-thyme-typescript

### nCube Thyme for Typescript

Pseudo [oneM2M](https://www.onem2m.org/) implementation focused on
[Mobius IoT platform](https://github.com/IoTKETI/Mobius)

## Install

```shell
$ npm i -S ncube-thyme-typescript
```

## Usage

```typescript
import { Thyme } from "ncube-thyme-typescript"

// create thyme instance
const thyme = new Thyme({
  main: {
    // restful protocol
    type: ThymeProtocol.HTTP, // http
    host: "203.253.128.161", // KETI test server
    port: 7579,
  },
  sub: {
    // subscribe protocol
    type: ThymeProtocol.MQTT, // mqtt
    port: 1883,
  },
})
async function printSensor() {
  // connect
  await thyme.connect()
  // Get Common Service Entity Base (Mobius platform)
  const mobius = await thyme.getCSEBase("Mobius")
  // Create Application Entity if not exist, Get Application Entity if exist
  const sampleAE = await mobius.ensureApplicationEntity(
    "ncube_nodejs_sample",
    false
  )
  // Create sensor value container (We will use light with 1024 byte space)
  const led = await sampleAE.ensureContainer("light", 1024, false)
  // Add value which we want to add :)
  await led.addContentInstance("100")
  // Print our last led value which we have been uploaded
  console.log("Sensor: " + (await led1.queryLastValue()))
}
printSensor()
```

- Result

```
Sensor: 100
```

## Original

[nCube-Thyme-Nodejs](https://github.com/IoTKETI/nCube-Thyme-Nodejs) by
[IoTKETI](https://github.com/IoTKETI)

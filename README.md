# ncube-thyme-typescript

### nCube Thyme for Typescript

Pseudo [oneM2M](https://www.onem2m.org/) implementation focused on
[Mobius IoT platform](https://github.com/IoTKETI/Mobius)

- Minimal function is working

## Install

```shell
$ npm i -S ncube-thyme-typescript
```

## Usage

```typescript
import { Thyme } from "ncube-thyme-typescript"

// create thyme instance with http & mqtt
/*
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
*/

// create thyme instance with only mqtt(subscriber protocol)
const thyme = new Thyme({
  main: {
    type: ThymeProtocol.MQTT, // mqtt
    host: "203.253.128.161", // KETI test server
    port: 1883,
  },
})
async function testLED() {
  // connect
  await thyme.connect()

  // Get Common Service Entity Base (Mobius platform)
  // first parameter is cse(common service entry)
  // second paramter is cse-id
  const mobius = await thyme.getCSEBase("Mobius", "Mobius2")

  // Create Application Entity if not exist, Get Application Entity if exist
  const sampleAE = await mobius.ensureApplicationEntity(
    "ncube_thyme_nodejs",
    false
  )

  // Create led value container (We will use light with 1024 byte space)
  const led = await sampleAE.ensureContainer("ledm", 1024, false)
  // Set value which we want :)
  await led.addContentInstance("100")
  // Print our last led value
  console.log("LED Light: " + (await led.queryLastValue()))
  // subscribe to log sensor when changed
  led.on("changed", (value) => {
    console.log("LED changed to " + value)
  })
  // Let's try to change several times :)
  await led.addContentInstance("200")
  await led.addContentInstance("300")
  await led.addContentInstance("400")
}
testLED()
```

- Result

```
LED Light: 100
LED changed to 200
LED changed to 300
LED changed to 400
```

## Original

[nCube-Thyme-Nodejs](https://github.com/IoTKETI/nCube-Thyme-Nodejs) by
[IoTKETI](https://github.com/IoTKETI)

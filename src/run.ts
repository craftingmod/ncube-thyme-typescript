import { Thyme, ThymeProtocol } from "./index"

async function testLED() {
  const thyme = new Thyme({
    main: {
      type: ThymeProtocol.MQTT,
      host: "203.253.128.177",
      port: 1883,
    },
  })

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

async function main2() {
  /*
  // HTTP & MQTT
  const thyme = new Thyme({
    main: {
      type: ThymeProtocol.HTTP,
      host: "203.253.128.177",
      port: 7579,
    },
    sub: {
      type: ThymeProtocol.MQTT,
      port: 1883,
    },
  })
  */
  const thyme = new Thyme({
    main: {
      type: ThymeProtocol.MQTT,
      host: "203.253.128.177",
      port: 1883,
    },
  })

  await thyme.connect()
  const mobius = await thyme.getCSEBase("Mobius", "Mobius2")
  const myAE = await mobius.ensureApplicationEntity("ncube_thyme_nodejs", true)
  const led1 = await myAE.ensureContainer("ledm", 16384, true)
  led1.on("changed", (value) => {
    console.log("LED changed to " + value)
  })
  await led1.addContentInstance("on")
  await led1.addContentInstance("off")
  await led1.addContentInstance("on222")
}

if (Math.random() === -1) {
  // never be happen
  main2()
}
testLED()

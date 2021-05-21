import { Thyme, ThymeProtocol } from "./index"

async function main2() {
  const thyme2 = new Thyme({
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
  await thyme2.connect()
  const mobius = await thyme2.getCSEBase("Mobius")
  const myAE = await mobius.ensureApplicationEntity("ncube_nodejs_sample", true)
  const led1 = await myAE.ensureContainer("led1", 16384, true)
  await led1.addContentInstance("123")
  console.log("Sensor: " + (await led1.queryLastValue()))
}

main2()

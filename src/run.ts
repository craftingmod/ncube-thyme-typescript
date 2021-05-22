import { Thyme, ThymeProtocol } from "./index"

async function main2() {
  /*const thyme2 = new Thyme({
    main: {
      type: ThymeProtocol.HTTP,
      host: "203.253.128.177",
      port: 7579,
    },
    sub: {
      type: ThymeProtocol.MQTT,
      port: 1883,
    },
  })*/
  const thyme2 = new Thyme({
    main: {
      type: ThymeProtocol.MQTT,
      host: "203.253.128.177",
      port: 1883,
    },
  })

  await thyme2.connect()
  const mobius = await thyme2.getCSEBase("Mobius", "Mobius2")
  const myAE = await mobius.ensureApplicationEntity("ncube-thyme-nodejs", false)
  const led1 = await myAE.ensureContainer("ledm", 16384, false)
  await led1.addContentInstance("on")
  await led1.subscribe("test4")
  console.log("Sensor: " + (await led1.queryLastValue()))
  await led1.addContentInstance("off")
  await led1.addContentInstance("on222")
}

main2()

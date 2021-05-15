import { Thyme } from "./index"

async function main() {
  const thyme = new Thyme("Mobius", {
    host: "203.253.128.177",
    port: 7579,
    protocol: "http",
  });
  await thyme.connect()
  // create Application Entity
  const myAE = await thyme.ensureApplicationEntity("ncube_ts_sample")
  // create Container
  const light = await thyme.ensureContainer(myAE, "light")
  await thyme.addContentInstance(light, "126788")
  console.log(`Sensor: ${(await thyme.queryLastContentInstance(light)).value}`)
}

main()
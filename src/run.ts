import { nCube } from "./ncube"

console.log("Hello World")

async function main() {
  const cube = new nCube("Mobius", {
    host: "203.253.128.177",
    port: 7579,
    protocol: "http",
  });
  await cube.connect()
  // create Application Entity
  const myAE = await cube.ensureApplicationEntity("ncube_ts_sample")
  // create Container
  const light = await cube.ensureContainer(myAE, "light")
  await cube.addContentInstance(light, "126788")
  console.log(`Sensor: ${(await cube.queryLastContentInstance(light)).value}`)
}

main()
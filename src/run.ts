import { Thyme } from "./index"

async function main() {
  const thyme = new Thyme("Mobius", {
    host: "203.253.128.177",
    main: "http",
    http: {
      port: 7579,
      secure: false,
    },
    mqtt: {
      port: 1883,
    }
  });
  await thyme.connect()
  // create Application Entity
  const myAE = await thyme.ensureApplicationEntity("ncube_nodejs_sample", true)
  // create Container
  const led1 = await thyme.ensureContainer(myAE, "led1", true)
  const led2 = await thyme.ensureContainer(myAE, "led2", true)
  await thyme.subscribeContainer(led1, "test1sub")
  await thyme.subscribeContainer(led2, "test2sub")
  await thyme.addContentInstance(led1, "120")
  await thyme.addContentInstance(led2, "120")
}

main()
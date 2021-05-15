# ncube-thyme-typescript

nCube Thyme for Typescript

## Install

```shell
$ npm i -S ncube-thyme-typescript
```

## Usage

###### Connect

```typescript
import { nCube } from 'ncube-thyme-typescript';

const cube = new nCube('Mobius', {
  host: 'localhost',
  port: 7579,
  protocol: 'http',
});

await cube.connect(); // in async function
```

###### Create Application Entity (Group)

```typescript
const cameraAE = await cube.ensureApplicationEntity('camera_sample');
```

###### Create Container (Sensor)

```typescript
const people = await cube.ensureContainer(cameraAE, 'people');
```

###### Set ContentInstance (Sensor Value)

```typescript
const count = await cube.addContentInstance(people, '5300');
console.log(count.value); // 5300
```

## Original

[nCube-Thyme-Nodejs](https://github.com/IoTKETI/nCube-Thyme-Nodejs) by [IoTKETI](https://github.com/IoTKETI)

import Chalk from "chalk"
import Debug from "debug"
import shortid from "shortid"

import { M2M_AE, M2M_AERes } from "./onem2m/m2m_ae"
import { convertM2MTimestamp, M2MBase, M2MError } from "./onem2m/m2m_base"
import { M2M_CB, M2M_CBRes } from "./onem2m/m2m_cb"
import { M2M_CIN, M2M_CINRes } from "./onem2m/m2m_cin"
import { M2M_CNT, M2M_CNTRes } from "./onem2m/m2m_cnt"
import { resNotExists } from "./onem2m/m2m_debug"
import {
  HTTPTransport,
  M2MHeader,
  M2MKeys,
  M2MOperation,
  M2MSubTransport,
  M2MTransport,
  MQTTTransport,
} from "./onem2m/m2m_protocol"
import { M2MStatusCode } from "./onem2m/m2m_rsp"
import { M2M_SUB, M2M_SUBRes } from "./onem2m/m2m_sub"
import { M2MType } from "./onem2m/m2m_type"

const debugMain = Debug("Thyme_main:main")
const debugSub = Debug("Thyme_main:sub")

const defaultMaxBufferSize = 20480
const APIVER = "0.2.481.2.0001.001.000111"

const m2m_ae_basebody = {
  api: APIVER,
  lbl: ["key1", "key2"],
  rr: true,
}

export class Thyme<M extends ThymeProtocol, S extends SubscribeProtos>
  implements ThymeBase
{
  protected mainProtoName: ThymeProtocol
  protected subProtoName: ThymeProtocol
  public mainProtocol: M2MTransport
  public subProtocol: M2MSubTransport
  public baseM2MHeader: M2MHeader
  public constructor(options: Thyme2Option<M, S>) {
    this.mainProtoName = options.main.type
    this.subProtoName = options.sub?.type ?? this.mainProtoName
    this.baseM2MHeader = {
      "X-M2M-RI": `thyme/${shortid()}`,
    }
    const getProto = (name: "main" | "sub") => {
      const opt = options[name]
      switch (opt.type) {
        case ThymeProtocol.HTTP:
          return new HTTPTransport(
            opt.host ?? options.main.host,
            opt.port,
            opt.secure ?? false
          )
          break
        case ThymeProtocol.MQTT:
          return new MQTTTransport(
            opt.host ?? options.main.host,
            opt.port,
            opt.secure ?? false
          )
          break
      }
      throw new Error("Not implemented")
    }
    this.mainProtocol = getProto("main")
    if (options.sub == null) {
      this.subProtocol = this.mainProtocol
    } else {
      this.subProtocol = getProto("sub")
    }
  }
  public async connect() {
    if (this.mainProtoName === (this.subProtoName as ThymeProtocol)) {
      const connected = await this.mainProtocol.connect()
      if (!connected) {
        throw new Error("Socket isn't connected.")
      }
    } else {
      const connected =
        (await this.mainProtocol.connect()) &&
        (await this.subProtocol.connect())
      if (!connected) {
        throw new Error("Socket isn't connected.")
      }
    }
  }
  /**
   * Get CommonServiceEntity Instance.
   *
   * `cseId` is required for mqtt protocol!
   * @param cseName
   * @param cseId
   * @returns
   */
  public async getCSEBase(cseName: string, cseId?: string) {
    const cseBaseRes = await this.mainProtocol.request<M2M_CBRes>({
      opcode: M2MOperation.RETRIEVE,
      rootCSE: {
        name: cseName,
        id: cseId ?? "",
      },
      params: [],
      useReg: true,
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": `S`,
      },
    })
    const cseBase = cseBaseRes.response[M2MKeys.cseBase]
    if (cseBase.rn != cseName) {
      throw new Error(`CSEBase does not match to ${cseName}!`)
    }
    debugMain(`${Chalk.gray("CSEBase")} ${Chalk.redBright(cseBase.rn)} found.`)
    return new ThymeCSE(this, cseBase)
  }
}

/**
 * Thyme CSE(Common Service Entry)
 */
export class ThymeCSE implements CSEBase, ThymeBase {
  public readonly type = M2MType.CSEBase
  public readonly createdTime: Date
  public readonly modifiedTime: Date
  public readonly resourceName: string
  public readonly resourceId: string
  public readonly cseName: string
  public readonly cseId: string
  public readonly raw: M2M_CB

  protected pointOfAccess: string[] = []

  public readonly mainProtocol: M2MTransport
  public readonly subProtocol: M2MSubTransport
  public readonly baseM2MHeader: M2MHeader
  public constructor(thymeBase: ThymeBase, resp: M2M_CB) {
    this.mainProtocol = thymeBase.mainProtocol
    this.subProtocol = thymeBase.subProtocol
    this.baseM2MHeader = thymeBase.baseM2MHeader
    this.raw = resp

    this.createdTime = convertM2MTimestamp(resp.ct)
    this.modifiedTime = convertM2MTimestamp(resp.lt)
    this.resourceName = resp.rn
    this.resourceId = resp.ri
    this.cseName = this.resourceName
    this.cseId = resp.csi.startsWith("/") ? resp.csi.substring(1) : resp.csi
    this.pointOfAccess.push(...resp.poa)
  }
  public async connect() {
    // nothing
    return true
  }
  /**
   * Create AE(Application Entity).
   *
   * If `ae` is exists, it will throw error.
   *
   * @param resourceName AE name
   * @returns Created ApplicationEntity object
   * @throws `Error` if `ae` is exist
   */
  public async createApplicationEntity(resourceName: string) {
    const createAERes = await this.mainProtocol.request<M2M_AERes>({
      opcode: M2MOperation.CREATE,
      resType: M2MType.ApplicationEntity,
      rootCSE: {
        name: this.cseName,
        id: this.cseId,
      },
      params: [],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": `S${resourceName}`,
      },
      body: {
        "m2m:ae": {
          ...m2m_ae_basebody,
          poa: this.pointOfAccess,
          rn: resourceName,
        },
      },
    })
    const response = createAERes.response[M2MKeys.applicationEntity]
    const out: ApplicationEntity = this.respToSerial(response)
    debugMain(
      `${getDeclaredName(out)} with id ${Chalk.yellow(
        response.aei
      )} has been ${Chalk.greenBright("created")}.`
    )
    return out
  }
  /**
   * Delete `AE`(Application Entity).
   *
   * If `ae` is not exists, it will throw error.
   *
   * @param resource `AE` name or `AE` object
   * @returns Deleted `AE` object. (Do not use it)
   * @throws `Error` if `ae` isn't exist
   */
  public async deleteApplicationEntity(
    resource: string | ApplicationEntity
  ): Promise<ApplicationEntity> {
    const resName =
      typeof resource === "string" ? resource : resource.resourceName
    // const aeInfo = await this.queryApplicationEntity(resName)
    const deleteAERes = await this.mainProtocol.request<M2M_AERes>({
      opcode: M2MOperation.DELETE,
      rootCSE: {
        name: this.cseName,
        id: this.cseId,
      },
      params: [resName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": "Superman",
      },
    })
    const response = deleteAERes.response[M2MKeys.applicationEntity]
    const out: ApplicationEntity = this.respToSerial(response)
    debugMain(
      `${getDeclaredName(out)} with id ${Chalk.yellow(
        response.aei
      )} has been ${Chalk.redBright("removed")}.`
    )
    return out
  }
  /**
   * Query `AE`(Application Entity) and return `AE` info.
   * @param resourceName `AE` name
   * @returns Queried `AE` object
   * @throws `Error` if `AE` isn't exist
   */
  public async queryApplicationEntity(
    resourceName: string
  ): Promise<ApplicationEntity> {
    const queryAERes = await this.mainProtocol.request<M2M_AERes>({
      opcode: M2MOperation.RETRIEVE,
      rootCSE: {
        name: this.cseName,
        id: this.cseId,
      },
      params: [resourceName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": `S${resourceName}`,
      },
    })
    const response = queryAERes.response[M2MKeys.applicationEntity]
    return this.respToSerial(response)
  }
  /**
   * Ensure given `AE`(Application Entity) is exist without error.
   * @param resourceName `AE` name
   * @param cleanup if enabled, `AE` is cleaned up if exists.
   * @returns Created or queried `AE` with active state
   */
  public async ensureApplicationEntity(
    resourceName: string,
    cleanup?: boolean
  ): Promise<ThymeAE> {
    let ae: ApplicationEntity = null
    try {
      ae = await this.queryApplicationEntity(resourceName)
    } catch (err: unknown) {
      if (err instanceof M2MError) {
        if (err.responseCode === M2MStatusCode.NOT_FOUND) {
          // pass
        } else {
          throw err
        }
      } else {
        throw err
      }
    }
    if (ae != null) {
      if (cleanup != null && cleanup) {
        await this.deleteApplicationEntity(ae)
      } else {
        return this.connectAE(ae)
      }
    }
    // create
    return this.connectAE(await this.createApplicationEntity(resourceName))
  }

  /**
   * Activate ApplicationEntity with subscribe & command
   * @param ae ApplicationEntity object
   * @returns ThymeAE
   */
  public async connectAE(ae: ApplicationEntity) {
    const out = new ThymeAE(this, ae)
    await out.connect()
    return out
  }
  /**
   * Response to serialized object
   * @param resp Response
   * @returns Serialized Object
   */
  protected respToSerial(resp: M2M_AE): ApplicationEntity {
    return {
      type: M2MType.ApplicationEntity,
      ...serialGeneral(resp),
      parentCSE: this,
      aei: resp.aei,
      raw: resp,
    }
  }
}

/**
 * Thyme AE(Application Entity)
 */
export class ThymeAE implements ApplicationEntity, ThymeBase {
  /* predefine */
  public readonly type: M2MType.ApplicationEntity = M2MType.ApplicationEntity
  public readonly resourceName: string
  public readonly resourceId: string
  public readonly createdTime: Date
  public readonly modifiedTime: Date

  public readonly parentCSE: ThymeCSE
  public readonly raw: M2M_AE
  public readonly mainProtocol: M2MTransport
  public readonly subProtocol: M2MSubTransport
  public readonly baseM2MHeader: M2MHeader

  public readonly aei: string

  public constructor(parentCSE: ThymeCSE, ae: ApplicationEntity) {
    this.aei = ae.aei
    this.resourceName = ae.resourceName
    this.resourceId = ae.resourceId
    this.createdTime = ae.createdTime
    this.modifiedTime = ae.modifiedTime
    this.parentCSE = parentCSE
    this.raw = ae.raw

    // CSE
    this.mainProtocol = parentCSE.mainProtocol
    this.subProtocol = parentCSE.subProtocol
    this.baseM2MHeader = parentCSE.baseM2MHeader
  }
  public async connect() {
    // @todo mqtt watch
  }
  /**
   * Create Container in `ae`
   * @param containerName Container Name
   * @param maxBufferSize **the max size of state. (in bytes)**
   * @returns Created Container
   * @throws If given name container is exist.
   */
  public async createContainer(
    containerName: string,
    maxBufferSize?: number
  ): Promise<Container> {
    const createCntRes = await this.mainProtocol.request<M2M_CNTRes>({
      opcode: M2MOperation.CREATE,
      resType: M2MType.Container,
      rootCSE: {
        name: this.parentCSE.cseName,
        id: this.parentCSE.cseId,
      },
      params: [this.resourceName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": this.aei,
      },
      body: {
        "m2m:cnt": {
          rn: containerName,
          lbl: [containerName],
          mbs: maxBufferSize ?? defaultMaxBufferSize, // maxBufferSize
        },
      },
    })
    const response = createCntRes.response[M2MKeys.container]
    const out: Container = this.respToSerial(response)
    debugMain(
      `${getDeclaredName(out)} has been ${Chalk.greenBright("created")}.`
    )
    return out
  }
  /**
   * Delete Container in `ae` or just container
   * @param container Container name or Container
   * @returns Deleted `Container` object. (Do not use it)
   * @throws If given `Container` isn't exist
   */
  public async deleteContainer(
    container: Container | string
  ): Promise<Container> {
    const conName =
      typeof container === "string" ? container : container.resourceName
    const deleteCntRes = await this.mainProtocol.request<M2M_CNTRes>({
      opcode: M2MOperation.DELETE,
      rootCSE: {
        name: this.parentCSE.cseName,
        id: this.parentCSE.cseId,
      },
      params: [this.resourceName, conName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": this.aei,
      },
    })
    const response = deleteCntRes.response[M2MKeys.container]
    const out: Container = this.respToSerial(response)
    debugMain(`${getDeclaredName(out)} has been ${Chalk.redBright("removed")}.`)
    return out
  }
  /**
   * Query `CNT`(Container) and return Container info.
   * @param containerName Container Name
   * @returns Queried Container object
   * @throws `Error` if `AE` or Container isn't exist
   */
  public async queryContainer(containerName: string): Promise<Container> {
    const queryCntRes = await this.mainProtocol.request<M2M_AERes>({
      opcode: M2MOperation.RETRIEVE,
      rootCSE: {
        name: this.parentCSE.cseName,
        id: this.parentCSE.cseId,
      },
      params: [this.resourceName, containerName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": `S${this.resourceName}`,
      },
    })
    const response = queryCntRes.response[M2MKeys.container]
    return this.respToSerial(response)
  }
  /**
   * Ensure given container is exist
   * @param containerName Container Name to query
   * @param maxBufferSize max Buffer size of value
   * @param cleanup the bool of Clear container
   * @returns Container of `containerName`
   */
  public async ensureContainer(
    containerName: string,
    maxBufferSize: number,
    cleanup?: boolean
  ) {
    let container: Container = null
    try {
      container = await this.queryContainer(containerName)
    } catch (err: unknown) {
      if (err instanceof M2MError) {
        if (err.responseCode === M2MStatusCode.NOT_FOUND) {
          // pass
        } else {
          throw err
        }
      } else {
        throw err
      }
    }
    if (container != null) {
      if (cleanup != null && cleanup) {
        await this.deleteContainer(container)
      } else {
        const cont = new ThymeContainer(this, container)
        await cont.connect()
        return cont
      }
    }
    // create
    const cont = new ThymeContainer(
      this,
      await this.createContainer(containerName, maxBufferSize)
    )
    await cont.connect()
    return cont
  }

  protected respToSerial(resp: M2M_CNT): Container {
    return {
      type: M2MType.Container,
      ...serialGeneral(resp),
      parentAE: this, // immutable..?
      maxBufferSize: resp.mbs,
      raw: resp,
    }
  }
}

/**
 * Container
 *
 * or sensor value store?
 */
export class ThymeContainer implements Container, ThymeBase {
  /* predefine */
  public readonly type = M2MType.Container
  public readonly resourceName: string
  public readonly resourceId: string
  public readonly createdTime: Date
  public readonly modifiedTime: Date

  public readonly raw: M2M_CNT
  public readonly parentAE: ThymeAE
  public readonly mainProtocol: M2MTransport
  public readonly subProtocol: M2MSubTransport
  public readonly baseM2MHeader: M2MHeader

  public readonly maxBufferSize: number

  public constructor(parentAE: ThymeAE, container: Container) {
    this.resourceName = container.resourceName
    this.resourceId = container.resourceId
    this.createdTime = container.createdTime
    this.modifiedTime = container.modifiedTime
    this.parentAE = parentAE
    this.raw = container.raw

    // CSE
    this.mainProtocol = parentAE.mainProtocol
    this.subProtocol = parentAE.subProtocol
    this.baseM2MHeader = parentAE.baseM2MHeader

    // Value
    this.maxBufferSize = container.maxBufferSize
  }
  public async connect() {
    return true
  }
  /**
   * Add ContentInstance value to Container
   *
   * aka. Put sensor value
   * @param value Value (string)
   * @returns ContentInstance
   */
  public async addContentInstance(value: string): Promise<ContentInstance> {
    const ae = this.parentAE
    const createCinRes = await this.mainProtocol.request<M2M_CINRes>({
      opcode: M2MOperation.CREATE,
      resType: M2MType.ContentInstance,
      rootCSE: {
        name: ae.parentCSE.cseName,
        id: ae.parentCSE.cseId,
      },
      params: [ae.resourceName, this.resourceName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": ae.aei,
      },
      body: {
        "m2m:cin": {
          con: value,
        },
      },
    })
    const response = createCinRes.response[M2MKeys.contentInstance]
    const out: ContentInstance = this.respToSerial(response)
    debugMain(
      `${getDeclaredName(out)} has been updated to ${Chalk.cyanBright(
        response.con
      )}.`
    )
    return out
  }
  /**
   * Get latest value of data
   *
   * If data isn't presented, It will return `""`
   * @returns string value(sensor data)
   */
  public async queryLastValue() {
    try {
      const data = await this.queryContentInstance({ latest: 1 })
      return data[0].value
    } catch (err: unknown) {
      if (err instanceof M2MError) {
        if (err.responseCode === M2MStatusCode.NOT_FOUND) {
          // pass
        } else {
          throw err
        }
      } else {
        throw err
      }
    }
    return ""
  }
  /**
   * Query ContentInstance
   *
   * Uses filter
   * @param filter Filter (before, after, latest cound)
   * @returns last `value` (string)
   * @throws There isn't any ContentInstance value
   */
  public async queryContentInstance(filter: {
    before?: Date
    after?: Date
    latest: number
  }): Promise<ContentInstance[]> {
    const ae = this.parentAE
    const queryCinRes = await this.mainProtocol.request<{
      "m2m:rsp": { "m2m:cin": M2M_CIN[] }
    }>({
      opcode: M2MOperation.RETRIEVE,
      rootCSE: {
        name: ae.parentCSE.cseName,
        id: ae.parentCSE.cseId,
      },
      params: [ae.resourceName, this.resourceName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": `S${ae.resourceName}`,
      },
      urlOptions: {
        ty: M2MType.ContentInstance, // resource type
        rcn: M2MType.ContentInstance, // response "content type"
        fu: 2, // API version? unknown
        crb: convertM2MTimestamp(filter.before) ?? undefined,
        cra: convertM2MTimestamp(filter.after) ?? undefined,
        la: filter.latest,
      },
    })
    const response = queryCinRes.response["m2m:rsp"]["m2m:cin"]
    const out: ContentInstance[] = response.map((v) => this.respToSerial(v))
    debugMain(
      `${getDeclaredName(out[0])} is ${out
        .map((v) => Chalk.blueBright(v.value))
        .join("|")}.`
    )
    return out
  }

  /**
   * Subscribe container.
   * @param container Container
   * @param subscribeName subscribe name
   * @returns subscribe data?
   */
  public async subscribe(subscribeName: string): Promise<SubscribeData> {
    const ae = this.parentAE
    let response: M2M_SUB
    try {
      const subExistRes = await this.mainProtocol.request<M2M_SUBRes>({
        opcode: M2MOperation.RETRIEVE,
        rootCSE: {
          name: ae.parentCSE.cseName,
          id: ae.parentCSE.cseId,
        },
        params: [ae.resourceName, this.resourceName, subscribeName],
        header: {
          ...this.baseM2MHeader,
          "X-M2M-Origin": `S${ae.resourceName}`,
        },
      })
      response = subExistRes.response[M2MKeys.subscribe]
    } catch (err) {
      if (err instanceof M2MError && err.debugLog === resNotExists) {
        const createSubRes = await this.mainProtocol.request<M2M_SUBRes>({
          opcode: M2MOperation.CREATE,
          resType: M2MType.Subscribe,
          rootCSE: {
            name: ae.parentCSE.cseName,
            id: ae.parentCSE.cseId,
          },
          params: [ae.resourceName, this.resourceName],
          header: {
            ...this.baseM2MHeader,
            "X-M2M-Origin": `S${ae.resourceName}`,
          },
          body: {
            "m2m:sub": {
              rn: subscribeName,
              enc: {
                net: [1, 2, 3, 4],
              },
              nu: [
                `${this.subProtocol.getBaseURL()}/S${ae.resourceName}?ct=json`,
              ],
              exc: 10,
            },
          },
        })
        response = createSubRes.response[M2MKeys.subscribe]
      } else {
        throw err
      }
    }
    // code
    debugSub(`${getDeclaredName(this)} is ${Chalk.greenBright("subscribed")}.`)
    return {
      type: M2MType.Subscribe,
      ...serialGeneral(response),
      raw: response,
      container: this,
      notiURL: response.nu[0],
    }
  }

  public async unsubscribeContainer(
    container: Container,
    subscribeName: string
  ): Promise<SubscribeData> {
    const ae = this.parentAE
    const deleteCntRes = await this.mainProtocol.request<M2M_SUBRes>({
      opcode: M2MOperation.DELETE,
      rootCSE: {
        name: ae.parentCSE.cseName,
        id: ae.parentCSE.cseId,
      },
      params: [ae.resourceName, this.resourceName, subscribeName],
      header: {
        ...this.baseM2MHeader,
        "X-M2M-Origin": `S${ae.resourceName}`,
      },
    })
    const response = deleteCntRes.response[M2MKeys.subscribe]
    debugSub(
      `${getDeclaredName(container)} is ${Chalk.redBright("unsubscribed")}.`
    )
    return {
      type: M2MType.Subscribe,
      ...serialGeneral(response),
      raw: response,
      container,
      notiURL: response.nu[0],
    }
  }

  protected respToSerial(resp: M2M_CIN): ContentInstance {
    return {
      type: M2MType.ContentInstance,
      ...serialGeneral(resp),
      container: this,
      value: resp.con,
      raw: resp,
    }
  }
}

interface Resource {
  readonly type: M2MType
  readonly resourceName: string
  readonly resourceId: string
  readonly createdTime: Date
  readonly modifiedTime: Date
}

export interface CSEBase extends Readonly<Resource> {
  readonly type: M2MType.CSEBase
  readonly raw: M2M_CB

  readonly cseName: string
  readonly cseId: string // for mqtt
}
export interface ApplicationEntity extends Readonly<Resource> {
  readonly type: M2MType.ApplicationEntity
  readonly parentCSE: CSEBase
  readonly raw: M2M_AE
  /**
   * Application Entity Id
   */
  readonly aei: string
}

export interface Container extends Readonly<Resource> {
  readonly type: M2MType.Container
  readonly parentAE: ApplicationEntity
  readonly raw: M2M_CNT
  /**
   * Max value size (length)
   */
  readonly maxBufferSize: number
}
export interface ContentInstance extends Readonly<Resource> {
  readonly type: M2MType.ContentInstance
  readonly raw: M2M_CIN
  readonly container: Container
  readonly value: string
}

export interface SubscribeData extends Readonly<Resource> {
  readonly type: M2MType.Subscribe
  readonly container: Container
  readonly raw: M2M_SUB
  readonly notiURL: string
}
/**
 * Support protocols
 */
type SubscribeProtos = ThymeProtocol.WebSocket | ThymeProtocol.MQTT
export type Thyme2Option<
  T extends ThymeProtocol,
  V extends SubscribeProtos | void
> = {
  main: {
    type: T
    host: string
    port: number
    secure?: boolean
  }
} & (T extends SubscribeProtos
  ? {
      sub?: {
        type: V
        port: number
        secure?: boolean
        host?: string
      }
    }
  : {
      sub: {
        type: V
        port: number
        secure?: boolean
        host?: string
      }
    })

export enum ThymeProtocol {
  HTTP = "http",
  MQTT = "mqtt",
  WebSocket = "webSocket",
  CoAP = "coap",
}
interface ThymeBase {
  mainProtocol: M2MTransport
  subProtocol: M2MSubTransport
  baseM2MHeader: M2MHeader
  connect: () => Promise<unknown>
}
export interface ThymeOption {
  host: string
  main: "http" // @todo support mqtt main
  http: {
    port: number
    secure?: false
  }
  mqtt: {
    port: number
  }
}

/**
 * Print name of element
 * @param entity Entity
 * @returns beautiful output
 */
function getDeclaredName(
  entity: ApplicationEntity | Container | ContentInstance
) {
  if (entity.type === M2MType.ApplicationEntity) {
    return `${Chalk.blue(entity.resourceName)}${Chalk.gray("(AE)")}`
  } else if (entity.type === M2MType.Container) {
    return `${Chalk.green(entity.resourceName)}${Chalk.gray(
      "(CNT)"
    )} in ${getDeclaredName(entity.parentAE)}`
  } else if (entity.type === M2MType.ContentInstance) {
    return `The value of ${getDeclaredName(entity.container)}`
  } else {
    return `unknown`
  }
}

function serialGeneral<T extends M2MBase>(resp: T) {
  return {
    createdTime: convertM2MTimestamp(resp.ct),
    modifiedTime: convertM2MTimestamp(resp.lt),
    resourceName: resp.rn,
    resourceId: resp.ri,
    raw: resp,
  }
}

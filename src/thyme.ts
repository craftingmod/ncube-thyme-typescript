import Chalk from "chalk"
import Debug from "debug"
import got, { Response } from "got"
import shortid from "shortid"

import { M2M_AERes } from "./onem2m/m2m_ae"
import { M2MError } from "./onem2m/m2m_base"
import { M2M_CBRes } from "./onem2m/m2m_cb"
import { M2M_CINRes } from "./onem2m/m2m_cin"
import { M2M_CNTRes } from "./onem2m/m2m_cnt"
import { resNotExists } from "./onem2m/m2m_debug"
import { M2M_Header } from "./onem2m/m2m_header"
import { M2M_Keys } from "./onem2m/m2m_key"
import { M2M_Type } from "./onem2m/m2m_type"

const debug = Debug("nCube")
const maxBufferSize = 16384
const APIVER = "0.2.481.2.0001.001.000111"

const m2m_ae_basebody = {
  api: APIVER,
  lbl: ["key1", "key2"],
  rr: true,
}

export class Thyme {
  private pointOfAccess:string[]
  private options:ThymeOption
  private cseBase:string
  private m2mBaseHeader:M2M_Header
  public constructor(base:string, options:ThymeOption) {
    this.options = options
    this.cseBase = base
    this.m2mBaseHeader = {
      "Accept": "application/json",
      "X-M2M-RI": `thyme/${shortid()}`,
    }
    if (this.options.protocol == null) {
      this.options.protocol = "http"
    }
    if (this.options.secure == null) {
      this.options.secure = false
    }
    if (this.options.host.endsWith("/")) {
      this.options.host = this.options.host.substring(0, this.options.host.length - 1)
    }
  }
  public async connect() {
    const cseBaseRes = await this.request<M2M_CBRes>(
      PostType.GET,
      [this.cseBase],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": "SOrigin",
      },
    )
    const cseBase = cseBaseRes.response[M2M_Keys.cseBase]
    if (cseBase.rn != this.cseBase) {
      throw new Error(`CSEBase does not match to ${this.cseBase}!`)
    }
    debug(`${Chalk.green(`${this.options.host}:${this.options.port}`)} is connected with ${Chalk.gray("CSEBase")} ${Chalk.redBright(cseBase.rn)}`)
    this.pointOfAccess = cseBase.poa 
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
  public async createApplicationEntity(resourceName:string):Promise<ApplicationEntity> {
    const createAERes = await this.request<M2M_AERes>(
      PostType.POST,
      [this.cseBase],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": "S",
        "Content-Type": genContentType(M2M_Type.ApplicationEntity),
      },
      {
        "m2m:ae": {
          ...m2m_ae_basebody,
          poa: this.pointOfAccess,
          rn: resourceName,
        }
      }
    )
    const response = createAERes.response[M2M_Keys.applicationEntity]
    debug(`${Chalk.blueBright("Application Entity")} ${Chalk.green(response.rn)
      } has been ${Chalk.greenBright("created")} with id ${Chalk.blue(response.aei)}`)
    return {
      type: M2M_Type.ApplicationEntity,
      resourceName: response.rn,
      resourceId: response.ri,
      aei: response.aei,
    }
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
  public async deleteApplicationEntity(resource:string | ApplicationEntity):Promise<ApplicationEntity> {
    const resName = typeof resource === "string" ? resource : resource.resourceName
    const deleteAERes = await this.request<M2M_AERes>(
      PostType.DELETE,
      [this.cseBase, resName],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": "Superman", // Permission?
      }
    )
    const response = deleteAERes.response[M2M_Keys.applicationEntity]
    debug(`${Chalk.blueBright("Application Entity")} ${Chalk.green(response.rn)
      } has been ${Chalk.redBright("removed")} with id ${Chalk.blue(response.aei)}`)
    return {
      type: M2M_Type.ApplicationEntity,
      resourceName: response.rn,
      resourceId: response.ri,
      aei: response.aei,
    }
  }
  /**
   * Query `AE`(Application Entity) and return `AE` info.
   * @param resourceName `AE` name
   * @returns Queried `AE` object
   * @throws `Error` if `AE` isn't exist
   */
  public async queryApplicationEntity(resourceName:string):Promise<ApplicationEntity> {
    const queryAERes = await this.request<M2M_AERes>(
      PostType.GET,
      [this.cseBase, resourceName],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": resourceName, // Permission again?
      }
    )
    const response = queryAERes.response[M2M_Keys.applicationEntity]
    return {
      type: M2M_Type.ApplicationEntity,
      resourceName: response.rn,
      resourceId: response.ri,
      aei: response.aei,
    }
  }
  /**
   * Ensure given `AE`(Application Entity) is exist without error.
   * @param resourceName `AE` name
   * @param cleanup if enabled, `AE` is cleaned up if exists.
   * @returns Created or queried `AE`
   */
  public async ensureApplicationEntity(resourceName:string, cleanup?:boolean):Promise<ApplicationEntity> {
    let ae:ApplicationEntity = null
    try {
      ae = await this.queryApplicationEntity(resourceName)
    } catch (err:unknown) {
      if (err instanceof M2MError) {
        if (err.debugLog == resNotExists) {
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
        return ae
      }
    }
    // create
    return this.createApplicationEntity(resourceName)
  }
  /**
   * Create Container in `ae`
   * @param ae Application Entity
   * @param containerName Container Name
   * @returns Created Container
   * @throws If given name container is exist.
   */
  public async createContainer(ae:ApplicationEntity, containerName:string):Promise<Container> {
    const createCntRes = await this.request<M2M_CNTRes>(
      PostType.POST,
      [this.cseBase, ae.resourceName],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": ae.aei,
        "Content-Type": genContentType(M2M_Type.Container),
      },
      {
        "m2m:cnt": {
          rn: containerName,
          lbl: [containerName],
          mbs: maxBufferSize, // maxBufferSize
        }
      }
    )
    const response = createCntRes.response[M2M_Keys.container]
    debug(`${Chalk.yellowBright("Container")} ${Chalk.green(response.rn)
      } has been ${Chalk.greenBright("created")} in ${Chalk.blue(ae.resourceName)} (AE)`)
    return {
      type: M2M_Type.Container,
      resourceName: response.rn,
      resourceId: response.ri,
      parentAE: ae, // immutable
    }
  }
  /**
   * Delete Container in `ae` or just container
   * @param aeOrContainer AE or Container
   * @param container Container name if AE is present
   * @returns Deleted `AE` object. (Do not use it)
   * @throws If given `Container` or `AE` isn't exist
   */
  public async deleteContainer(aeOrContainer:ApplicationEntity | Container, container?:string):Promise<Container> {
    const ae = aeOrContainer.type === M2M_Type.Container ? aeOrContainer.parentAE : aeOrContainer
    const conName = aeOrContainer.type === M2M_Type.Container ? aeOrContainer.resourceName : container
    const deleteCntRes = await this.request<M2M_CNTRes>(
      PostType.DELETE,
      [this.cseBase, ae.resourceName, conName],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": ae.aei,
      }
    )
    const response = deleteCntRes.response[M2M_Keys.container]
    debug(`${Chalk.yellowBright("Container")} ${Chalk.green(response.rn)
      } has been ${Chalk.redBright("removed")} in ${Chalk.blue(ae.resourceName)} (AE)`)
    return {
      type: M2M_Type.Container,
      resourceName: response.rn,
      resourceId: response.ri,
      parentAE: ae, // immutable
    }
  }
  /**
   * Query `CNT`(Container) and return Container info.
   * @param ae Application Entity
   * @param containerName Container Name
   * @returns Queried Container object
   * @throws `Error` if `AE` or Container isn't exist
   */
  public async queryContainer(ae:ApplicationEntity, containerName:string):Promise<Container> {
    const queryCntRes = await this.request<M2M_CNTRes>(
      PostType.GET,
      [this.cseBase, ae.resourceName, containerName],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": "SOrigin",
      }
    )
    const response = queryCntRes.response[M2M_Keys.container]
    return {
      type: M2M_Type.Container,
      resourceName: response.rn,
      resourceId: response.ri,
      parentAE: ae, // immutable
    }
  }
  /**
   * Ensure given container is exist
   * @param ae Application Entity
   * @param containerName Container Name to query
   * @param cleanup the bool of Clear container
   * @returns Container of `containerName`
   */
  public async ensureContainer(ae:ApplicationEntity, containerName:string, cleanup?:boolean):Promise<Container> {
    let container:Container = null
    try {
      container = await this.queryContainer(ae, containerName)
    } catch (err:unknown) {
      if (err instanceof M2MError) {
        if (err.debugLog == resNotExists) {
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
        return container
      }
    }
    // create
    return this.createContainer(ae, containerName)
  }
  /**
   * Add ContentInstance value to Container
   * @param container Container
   * @param value Value (string)
   * @returns ContentInstance
   */
  public async addContentInstance(container:Container, value:string):Promise<ContentInstance> {
    const ae = container.parentAE
    const createCinRes = await this.request<M2M_CINRes>(
      PostType.POST,
      [this.cseBase, ae.resourceName, container.resourceName],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": ae.aei,
        "Content-Type": genContentType(M2M_Type.ContentInstance),
      },
      {
        "m2m:cin": {
          "con": value
        }
      }
    )
    const response = createCinRes.response[M2M_Keys.contentInstance]
    debug(`${Chalk.yellowBright("Container")} ${Chalk.green(container.resourceName)
      }'s value has been ${Chalk.yellow("updated")} to ${Chalk.cyanBright(response.con)} in ${Chalk.blue(ae.resourceName)} (AE)`)
    return {
      type: M2M_Type.ContentInstance,
      resourceName: response.rn,
      resourceId: response.ri,
      value: response.con,
      container,
    }
  }
  /**
   * Query last ContentInstance value
   * @param container Container
   * @returns last `value` (string)
   * @throws There isn't any ContentInstance value
   */
  public async queryLastContentInstance(container:Container):Promise<ContentInstance> {
    const ae = container.parentAE
    const queryCinRes = await this.request<M2M_CINRes>(
      PostType.GET,
      [this.cseBase, ae.resourceName, container.resourceName, "latest"],
      {
        ...this.m2mBaseHeader,
        "X-M2M-Origin": "SOrigin",
      }
    )
    const response = queryCinRes.response[M2M_Keys.contentInstance]
    debug(`${Chalk.yellowBright("Container")} ${Chalk.green(container.resourceName)
    }'s value is ${Chalk.cyanBright(response.con)} in ${Chalk.blue(ae.resourceName)} (AE)`)
    return {
      type: M2M_Type.ContentInstance,
      resourceName: response.rn,
      resourceId: response.ri,
      value: response.con,
      container,
    }
  }
  
  /**
   * Raw request to Mobius server and receive them.
   * @param type HTTP Type (@todo support other protocol)
   * @param suburls The array of url which will be postfix (ex: `mobius`/`mynewapp`/`led`)
   * @param header M2M Header + Custom header to send
   * @param body The JSON body which will send
   * @returns Response with type `T`
   */
  public async request<T>(type:PostType, suburls:string[], header:M2M_Header | Record<string, unknown>, body?:Record<string, unknown>):Promise<ResponsePair<T>> {
    if (this.options.protocol == "http") {
      const url = `${this.options.secure ? "https" : "http"}://${this.options.host}:${this.options.port}/${suburls.join("/")}`
      let response:Response<unknown>
      if (type == PostType.GET) {
        response = await got.get(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers: header as any,
        })
      } else if (type == PostType.POST) {
        response = await got.post(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers: header as any,
          json: body ?? {},
        })
      } else if (type == PostType.DELETE) {
        response = await got.delete(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers: header as any,
        })
      }
      const resBody = response.body as Record<string, unknown>
      const errorMsg = resBody[M2M_Keys.debug] as string | null
      if (errorMsg != null) {
        throw new M2MError(errorMsg)
      }
      return {
        statusCode: response.statusCode,
        response: resBody as T
      }
    } else {
      // @todo implement websocket, mqtt
      throw new Error("Not implemented yet.")
    }
  }
}

function genContentType(type:M2M_Type) {
  return `application/vnd.onem2m-res+json;ty=${type}`
}

interface Resource {
  readonly type:M2M_Type,
  readonly resourceName:string,
  readonly resourceId:string,
}

export interface ApplicationEntity extends Readonly<Resource> {
  readonly type:M2M_Type.ApplicationEntity,
  readonly aei:string,
}

export interface Container extends Readonly<Resource> {
  readonly type:M2M_Type.Container,
  readonly parentAE:ApplicationEntity,
}
export interface ContentInstance extends Readonly<Resource> {
  readonly type:M2M_Type.ContentInstance,
  readonly container:Container,
  readonly value:string,
}

export interface ThymeOption {
  host:string,
  port:number,
  protocol?:"http", // @todo support websocket, coap, mqtt
  secure?:false // @todo secure connection..
}

interface ResponsePair<T> {
  statusCode: number,
  response: T,
}

enum PostType {
  POST = "POST",
  GET = "GET",
  DELETE = "DELETE"
}
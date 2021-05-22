import Chalk from "chalk"
import debug from "debug"
import got, { Response } from "got"
import colorJson from "json-colorizer"
import mqtt from "mqtt"
import queryString from "query-string"
import shortid from "shortid"

import { Container } from "../thyme"

import { M2MError } from "./m2m_base"
import { M2M_CIN, M2M_CINRes } from "./m2m_cin"
import { M2M_RSP, M2MStatusCode } from "./m2m_rsp"
import { M2MType } from "./m2m_type"

/**
 * common type
 */
export abstract class M2MTransport {
  public urlHeader: string
  public readonly host: string
  public readonly port: number
  public secure: boolean
  public constructor(_host: string, _port: number, _secure?: boolean) {
    this.host = _host
    this.secure = _secure ?? false
    this.port = _port
  }
  public getBaseURL() {
    return `${this.urlHeader}://${this.host}:${this.port}`
  }
  public abstract connect(): Promise<boolean>
  public abstract request<T>(options: RequestOptions): Promise<ResponsePair<T>>
}

export type CINSubCallback = (contentInstance: M2M_CIN) => unknown
export abstract class M2MSubTransport extends M2MTransport {
  protected cinCallbacks: Map<string, Array<CINSubCallback>> = new Map()
  public abstract subscribeContainer(
    container: Container,
    subName: string,
    callback: CINSubCallback
  ): Promise<void>
  public abstract unsubscribeContainer(
    container: Container,
    subName: string
  ): Promise<void>
}
/**
 * HTTP Transport
 */
const debugHttp = debug("Thyme_socket:http")
export class HTTPTransport extends M2MTransport {
  public constructor(_host: string, _port: number, _secure?: boolean) {
    super(_host, _port, _secure)
    this.urlHeader = `http${this.secure ? "s" : ""}`
  }
  public async connect() {
    // http
    debugHttp(
      `${Chalk.gray("[HTTP]")} ${Chalk.green(this.getBaseURL())} configured.`
    )
    return true
  }
  public async request<T>(options: RequestOptions): Promise<ResponsePair<T>> {
    // querystring
    let postParams = ""
    if (options.urlOptions != null) {
      postParams = "?" + queryString.stringify(options.urlOptions)
    }
    const url = `${this.getBaseURL()}/${[
      options.rootCSE.name,
      ...options.params,
    ]
      .map((s) => s.replace(/\//gi, ":"))
      .join("/")}${postParams}`
    const { header, body } = options
    const headers = {
      Accept: "application/json",
      "Content-Type":
        options.resType != null
          ? `application/vnd.onem2m-res+json;ty=${options.resType}`
          : undefined,
      ...header,
    } as any
    let response: Response<unknown>
    switch (options.opcode) {
      case M2MOperation.CREATE:
      case M2MOperation.NOTIFY:
        response = await got.post(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers,
          json: body ?? {},
        })
        break
      case M2MOperation.RETRIEVE:
        response = await got.get(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers,
        })
        break
      case M2MOperation.DELETE:
        response = await got.delete(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers,
        })
        break
      case M2MOperation.UPDATE:
        response = await got.put(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers,
          json: body ?? {},
        })
        break
    }
    const convertRSC = (rsc: number) => {
      switch (rsc) {
        case 200:
          return M2MStatusCode.OK
        case 201:
          return M2MStatusCode.CREATED
        case 202:
          return M2MStatusCode.DELETED
        case 204:
          return M2MStatusCode.CHANGED
        case 404:
          return M2MStatusCode.NOT_FOUND
        case 413:
          return M2MStatusCode.ACCESS_DENIED
        case 500:
          return M2MStatusCode.INTERNAL_SERVER_ERROR
      }
      return rsc
    }

    const statusCode = convertRSC(response.statusCode) as M2MStatusCode
    if (statusCode === M2MStatusCode.INTERNAL_SERVER_ERROR) {
      throw new Error(`Internal server error. (${response.statusMessage})`)
    }
    const resBody = response.body as Record<string, unknown>
    const errorMsg = resBody[M2MKeys.debug] as string | null
    let debugMsg = `${Chalk.gray("[HTTP]")} ${Chalk.green(
      url
    )} ${Chalk.blueBright(
      ["", "POST", "GET", "PUT", "DELETE", "POST", "??"][options.opcode]
    )} ${colorJson(headers)}`
    debugMsg += `\n${Chalk.gray("[HTTP]")}  └ Request: ${colorJson(
      JSON.stringify(body ?? {})
    )}`
    debugMsg += `\n${Chalk.gray("[HTTP]")}  └ Response: ${Chalk.blueBright(
      response.statusCode
    )} ${colorJson(JSON.stringify(resBody))}`
    debugHttp(debugMsg)
    if (errorMsg != null) {
      throw new M2MError(errorMsg, response.statusCode)
    }
    return {
      statusCode,
      response: resBody as T,
    }
  }
}

const debugMqtt = debug("Thyme_socket:mqtt")
/**
 * MQTT Transport
 *
 * from: https://wiki.eclipse.org/OM2M/one/MQTT_Binding
 */
export class MQTTTransport extends M2MSubTransport {
  protected client: mqtt.Client
  protected subTopics: Map<string, number> = new Map()
  public constructor(_host: string, _port: number, _secure?: boolean) {
    super(_host, _port, _secure)
    this.urlHeader = `mqtt${this.secure ? "s" : ""}`
  }
  public async connect() {
    this.client = mqtt.connect(this.getBaseURL())
    await new Promise<void>((res, rej) => {
      const timeout = setTimeout(() => rej(new Error("Timeout")), 5000)
      this.client.once("connect", () => {
        clearTimeout(timeout)
        debugMqtt(
          `${Chalk.gray("[MQTT]")} ${Chalk.green(
            this.getBaseURL()
          )} is connected.`
        )
        res()
      })
    })
    this.client.on("message", this.handleMessage.bind(this))
    /*
    this.client.subscribe("/oneM2M/req/+")
    this.client.subscribe("/oneM2M/resp/+")
    this.client.on("message", (topic, message) => {
      debugMqtt(
        `RAW_RESP ${Chalk.gray("[MQTT]")} ${Chalk.green(
          topic
        )}: ${message.toString("utf8")}`
      )
    })
    */
    // todo
    return true
  }
  protected async handleMessage(topic: string, buf: Buffer) {
    if (!this.subTopics.has(topic)) {
      // request topics
      return
    }
    const message = JSON.parse(buf.toString("utf8")) as {
      op: M2MOperation // opcode
      rqi: string // unique id
      to: string // virtual address?
      fr: string // almost cse
      pc: {
        "m2m:sgn": {
          sur: string // subscribed URL
          nev: {
            rep: unknown // response
          }
        }
      }
    }
    const uri = message.pc["m2m:sgn"].sur
    if (this.cinCallbacks.has(uri)) {
      // cin handle
      const resp = message.pc["m2m:sgn"].nev.rep as M2M_CINRes
      if (resp["m2m:cin"] == null) {
        return
      }
      for (const callback of this.cinCallbacks.get(uri)) {
        callback(resp["m2m:cin"])
      }
    }
  }
  public async subscribeContainer(
    container: Container,
    subName: string,
    callback: CINSubCallback
  ) {
    // 1. subscribe receiver
    const topicName = `/oneM2M/req/${container.parentAE.parentCSE.cseId}/${container.parentAE.aei}/json`
    if (!this.subTopics.has(topicName)) {
      this.client.subscribe(topicName)
      this.subTopics.set(topicName, 1)
    } else {
      this.subTopics.set(topicName, this.subTopics.get(topicName) + 1)
    }
    // 2. add callback
    const resourceURI = `${container.parentAE.parentCSE.cseName}/${container.parentAE.resourceName}/${container.resourceName}/${subName}`
    if (!this.cinCallbacks.has(resourceURI)) {
      this.cinCallbacks.set(resourceURI, [])
    }
    this.cinCallbacks.get(resourceURI).push(callback)
  }
  public async unsubscribeContainer(
    container: Container,
    subName: string,
    callback?: CINSubCallback
  ) {
    const topicName = `/oneM2M/req/${container.parentAE.parentCSE.cseId}/${container.parentAE.aei}/json`
    // 1. unsubscribe receiver
    if (this.subTopics.has(topicName)) {
      const subs = this.subTopics.get(topicName)
      if (subs <= 1) {
        this.client.unsubscribe(topicName)
        this.subTopics.delete(topicName)
      } else {
        this.subTopics.set(topicName, subs - 1)
      }
    }
    // 2. remove callback
    const resourceURI = `${container.parentAE.parentCSE.cseName}/${container.parentAE.resourceName}/${container.resourceName}/${subName}`
    if (this.cinCallbacks.has(resourceURI)) {
      if (callback == null) {
        this.cinCallbacks.delete(resourceURI)
      } else {
        const callbacks = this.cinCallbacks.get(resourceURI)
        const index = callbacks.indexOf(callback)
        if (index >= 0) {
          callbacks.splice(index, 1)
        }
        if (callbacks.length <= 0) {
          this.cinCallbacks.delete(resourceURI)
        }
      }
    }
  }
  public async request<T>(options: RequestOptions): Promise<ResponsePair<T>> {
    const destinations = options.params.map((s) => s.replace(/\//gi, ":")) // except CSEBase
    const useReg = options.useReg ?? false
    const AELevel = destinations.length > 0
    const uid = shortid()
    let targetId = options.header["X-M2M-Origin"] ?? "Superman"
    if (targetId === "S") {
      targetId = `S${shortid()}`
    }
    let originator = options.rootCSE.id
    if (originator == null) {
      throw new Error("CSE ID is required for mqtt base.")
    } else if (originator.startsWith("/")) {
      originator = originator.substr(1)
    }
    // querystring
    let postParams = ""
    if (options.urlOptions != null) {
      postParams = "?" + queryString.stringify(options.urlOptions)
    }
    // /oneM2M/req/$uid/json
    let reqUrl: string
    let respUrl: string
    if (useReg) {
      reqUrl = `/oneM2M/reg_req/${targetId}/${originator}/json`
      respUrl = `/oneM2M/reg_resp/${targetId}/${originator}/json`
    } else {
      reqUrl = `/oneM2M/req/${targetId}/${originator}/json`
      respUrl = `/oneM2M/resp/${targetId}/${originator}/json`
    }

    // request Object
    const requestObj: Record<string, unknown> = {
      fr: targetId,
      to: `/${options.rootCSE.name}${
        AELevel ? "/" + destinations.join("/") : ""
      }${postParams}`,
      op: options.opcode,
      rqi: uid,
      ty: options.resType ?? undefined,
      pc: options.body ?? {},
    }
    const reqBody = JSON.stringify({ "m2m:rqp": requestObj })

    // request debug log
    debugMqtt(
      `${Chalk.gray("[MQTT]")} Request ${Chalk.green(
        reqUrl
      )} ${Chalk.blueBright(
        ["", "POST", "GET", "PUT", "DELETE", "POST", "??"][options.opcode]
      )} ${colorJson(JSON.stringify(reqBody))}`
    )
    const response = await new Promise<M2M_RSP<T>>((res, rej) => {
      this.client.subscribe(respUrl)
      const timeout = setTimeout(() => {
        this.client.unsubscribe(respUrl)
        rej(new Error("MQTT Timeout"))
      }, 5000)
      const listener = (topic: string, rawMsg: Buffer) => {
        if (topic === respUrl) {
          const msg = rawMsg.toString("utf8")
          const resp = JSON.parse(msg) as M2M_RSP<T>
          if (resp.rqi === uid) {
            this.client.off("message", listener)
            clearTimeout(timeout)
            res(resp)
          }
        }
      }
      this.client.on("message", listener)
      this.client.publish(reqUrl, reqBody, {})
    })
    // response debug log
    debugMqtt(
      `${Chalk.gray("[MQTT]")} Response ${Chalk.green(respUrl)} ${colorJson(
        JSON.stringify(response)
      )}`
    )
    const convertRSC = (rsc: number) => {
      switch (rsc) {
        case 2000:
          return M2MStatusCode.OK
        case 2001:
          return M2MStatusCode.CREATED
        case 2002:
          return M2MStatusCode.DELETED
        case 2004:
          return M2MStatusCode.CHANGED
        case 4004:
          return M2MStatusCode.NOT_FOUND
        case 4103:
          return M2MStatusCode.ACCESS_DENIED
        case 5000:
          return M2MStatusCode.INTERNAL_SERVER_ERROR
      }
      return rsc
    }

    const statusCode = convertRSC(response.rsc) as M2MStatusCode
    if (statusCode === M2MStatusCode.INTERNAL_SERVER_ERROR) {
      throw new Error(`Internal server error.`)
    }
    const resBody = response.pc
    const errorMsg = resBody[M2MKeys.debug] as string | null
    if (errorMsg != null) {
      throw new M2MError(errorMsg, response.rsc)
    }
    return {
      statusCode,
      response: resBody,
    }
  }
}

/**
 * HTTP - 6.2.1
 */

export enum M2MOperation {
  CREATE = 1,
  RETRIEVE = 2,
  UPDATE = 3,
  DELETE = 4,
  NOTIFY = 5,
  DISCOVERY = 6,
}

export interface RequestOptions {
  opcode: M2MOperation
  header: M2MHeader & Record<string, unknown>
  rootCSE: { name: string; id?: string }
  params: string[]
  resType?: M2MType
  urlOptions?: Record<string, unknown>
  useReg?: boolean
  body?: Record<string, unknown>
}

export enum M2MKeys {
  debug = "m2m:dbg",
  cseBase = "m2m:cb",
  container = "m2m:cnt",
  contentInstance = "m2m:cin",
  applicationEntity = "m2m:ae",
  subscribe = "m2m:sub",
}

export interface M2MHeader {
  "X-M2M-RI": string | number
  "X-M2M-Origin"?: string
  "Content-Type"?: string
}

export interface ResponsePair<T> {
  statusCode: M2MStatusCode
  response: T
}

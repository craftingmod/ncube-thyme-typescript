import Chalk from "chalk"
import debug from "debug"
import got, { Response } from "got"
import colorJson from "json-colorizer"
import mqtt from "mqtt"
import queryString from "query-string"
import shortid from "shortid"

import { M2MError } from "./m2m_base"
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

export abstract class M2MSubTransport extends M2MTransport {}
/**
 * HTTP Transport
 */
const debugHttp = debug("Thyme_m2m:http")
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

const debugMqtt = debug("Thyme_m2m:mqtt")
/**
 * MQTT Transport
 *
 * from: https://wiki.eclipse.org/OM2M/one/MQTT_Binding
 */
export class MQTTTransport extends M2MSubTransport {
  protected client: mqtt.Client
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
    this.client.subscribe("/oneM2M/req/+")
    this.client.subscribe("/oneM2M/resp/+")
    this.client.on("message", (topic, message) => {
      debugMqtt(
        `RAW_RESP ${Chalk.gray("[MQTT]")} ${Chalk.green(
          topic
        )}: ${message.toString("utf8")}`
      )
    })
    // todo
    return true
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

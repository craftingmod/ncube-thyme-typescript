import Chalk from "chalk"
import debug from "debug"
import got, { Response } from "got"
import colorJson from "json-colorizer"
import queryString from "query-string"

import { M2MError } from "./m2m_base"

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
      `${Chalk.gray("[HTTP]")} ${Chalk.green(
        `${this.getBaseURL()}`
      )} is connected.`
    )
    return true
  }
  public async request<T>(options: RequestOptions): Promise<ResponsePair<T>> {
    // querystring
    let postParams = ""
    if (options.urlOptions != null) {
      postParams = "?" + queryString.stringify(options.urlOptions)
    }
    const url = `${this.getBaseURL()}/${options.params.join("/")}${postParams}`
    const { header, body } = options
    let response: Response<unknown>
    switch (options.opcode) {
      case M2MOperation.CREATE:
      case M2MOperation.NOTIFY:
        response = await got.post(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers: {
            Accept: "application/json",
            ...header,
          } as any,
          json: body ?? {},
        })
        break
      case M2MOperation.RETRIEVE:
        response = await got.get(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers: {
            Accept: "application/json",
            ...header,
          } as any,
        })
        break
      case M2MOperation.DELETE:
        response = await got.delete(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers: {
            Accept: "application/json",
            ...header,
          } as any,
        })
        break
      case M2MOperation.UPDATE:
        response = await got.put(url, {
          responseType: "json",
          throwHttpErrors: false,
          headers: {
            Accept: "application/json",
            ...header,
          } as any,
        })
        break
    }
    if (response.statusCode === 500) {
      throw new Error(`Internal server error. (${response.statusMessage})`)
    }
    const resBody = response.body as Record<string, unknown>
    const errorMsg = resBody[M2MKeys.debug] as string | null
    let debugMsg = `${Chalk.gray("[HTTP]")} ${Chalk.green(
      url
    )} ${Chalk.blueBright(
      ["POST", "GET", "PUT", "DELETE", "POST"][options.opcode]
    )}`
    debugMsg += `\n${Chalk.gray("[HTTP]")} Request: ${colorJson(
      JSON.stringify(body ?? {})
    )}`
    debugMsg += `\n${Chalk.gray("[HTTP]")} Response: ${Chalk.blueBright(
      response.statusCode
    )} ${colorJson(JSON.stringify(resBody))}`
    debugHttp(debugMsg)
    if (errorMsg != null) {
      throw new M2MError(errorMsg, response.statusCode)
    }
    return {
      statusCode: response.statusCode,
      response: resBody as T,
    }
  }
}

export class MQTTTransport extends M2MSubTransport {
  public constructor(_host: string, _port: number, _secure?: boolean) {
    super(_host, _port, _secure)
  }
  public async connect() {
    // todo
    return true
  }
  public async request<T>(options: RequestOptions): Promise<ResponsePair<T>> {
    console.log(options.opcode)
    throw new Error("Not Implemented")
  }
}

/**
 * HTTP - 6.2.1
 */

export enum M2MOperation {
  CREATE,
  RETRIEVE,
  UPDATE,
  DELETE,
  NOTIFY,
}

export interface RequestOptions {
  opcode: M2MOperation
  header: M2MHeader & Record<string, unknown>
  params: string[]
  urlOptions?: Record<string, unknown>
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
  statusCode: number
  response: T
}

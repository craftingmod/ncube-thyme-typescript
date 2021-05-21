import { DateString, M2MType } from "./m2m_type"

/**
 * M2M Response base
 *
 * `pi`, `ri`, `ty`, `ct`, `rn`, `lt`, `lbl`
 */
export interface M2MBase {
  /**
   * Parent resource's id
   *
   * `[KR]`: 부모 자원의 ID, remoteCSE(parentID)
   */
  pi: string
  /**
   * Resource Id
   *
   * `[KR]`: 생성된 자원의 고유 ID (resourceID, X-M2M-RI)
   */
  ri: string
  /**
   * M2M resource type
   *
   * `[KR]`: 자원 유형 (resourceType)
   */
  ty: M2MType
  /**
   * Creation time
   *
   * `[KR]`: 생성된 자원의 시점 (creationTime)
   */
  ct: DateString
  /**
   * Resource Name
   *
   * `[KR]`: 생성된 자원의 이름 (resourceName)
   */
  rn: string
  /**
   * Last Modified Time
   *
   * `[KR]`: 자원의 최종 수정 시간 (lastModifiedTime)
   */
  lt: DateString
  /**
   * labels
   *
   * `[KR]`: 자원에 사용할 수 있는 Tag 정보 (labels)
   */
  lbl: string[]
}

export class M2MError extends Error {
  public debugLog: string
  public responseCode: number
  public constructor(msg: string, respCode?: number) {
    super(msg)
    this.debugLog = msg
    this.responseCode = respCode ?? -1
  }
}

export function convertM2MTimestamp<T extends string | Date>(
  param: T
): T extends string ? Date : string {
  if (param == null) {
    return null
  }
  if (param instanceof Date) {
    const toStr = (num: number, ln: number) =>
      num.toString(10).padStart(ln, "0")
    let out = ""
    out += toStr(param.getUTCFullYear(), 4)
    out += toStr(param.getUTCMonth() + 1, 2)
    out += toStr(param.getUTCDate(), 2)
    out += "T"
    out += toStr(param.getUTCHours(), 2)
    out += toStr(param.getUTCMinutes(), 2)
    out += toStr(param.getUTCSeconds(), 2)
    return out as any // ?
  } else if (typeof param === "string") {
    const parseNum = (start: number, ln: number) =>
      Number.parseInt(param.substr(start, ln))
    const date = new Date(
      Date.UTC(
        parseNum(0, 4),
        parseNum(4, 2) - 1,
        parseNum(6, 2),
        parseNum(9, 2),
        parseNum(11, 2),
        parseNum(13, 2)
      )
    )
    return date as any // ?
  } else {
    return null
  }
}

import { DateString, M2M_Type } from "./m2m_type";

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
  pi: string,
  /**
    * Resource Id
    * 
    * `[KR]`: 생성된 자원의 고유 ID (resourceID, X-M2M-RI)
    */
  ri: string,
  /**
   * M2M resource type
   * 
   * `[KR]`: 자원 유형 (resourceType)
   */
  ty: M2M_Type,
  /**
   * Creation time
   * 
   * `[KR]`: 생성된 자원의 시점 (creationTime)
   */
  ct: DateString,
  /**
   * Resource Name
   * 
   * `[KR]`: 생성된 자원의 이름 (resourceName)
   */
  rn: string,
  /**
   * Last Modified Time
   * 
   * `[KR]`: 자원의 최종 수정 시간 (lastModifiedTime)
   */
  lt: DateString,
  /**
   * labels
   * 
   * `[KR]`: 자원에 사용할 수 있는 Tag 정보 (labels)
   */
  lbl: string[],
}

export class M2MError extends Error {
  public debugLog:string
  public constructor(msg: string) {
    super(msg)
    this.debugLog = msg
  }
}

export function convertM2MTimestamp(str:DateString) {
  const parseNum = (start:number, ln:number) => Number.parseInt(str.substr(start, ln))
  const date = new Date(Date.UTC(
    parseNum(0, 4),
    parseNum(4, 2) - 1,
    parseNum(6, 2),
    parseNum(9, 2),
    parseNum(11, 2),
    parseNum(13, 2)
  ))
  return date
}
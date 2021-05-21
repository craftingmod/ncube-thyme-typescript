import { M2MBase } from "./m2m_base";
import { DateString, M2MType } from "./m2m_type";

/**
 * oneM2M Container Base
 * 
 * `from`: Response pattern
 */
export interface M2M_CNT extends M2MBase {
  ty: M2MType.Container,
  /**
   * Expire Time
   */
  et: unknown | DateString,
  /**
   * max Number Of Instances (SecureConnection?)
   */
  mni: number,
  /**
   * Max Buffer Size
   */
  mbs: number,
  /**
   * Max Instance Age
   */
  mia: number,
  /**
   * Creator? Create? just refer `parent Id`
   */
  cr: string,
  /**
   * Current number of Instance (SecureConnection?)
   */
  cni: number,
  /**
   * Current Byte Size
   */
  cbs: number,
}

export type M2M_CNTRes = {
  "m2m:cnt": M2M_CNT,
}
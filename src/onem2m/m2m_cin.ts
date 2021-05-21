import { M2MBase } from "./m2m_base";
import { DateString, M2MType } from "./m2m_type";

/**
 * oneM2M Container Base
 * 
 * `from`: Response pattern
 */
export interface M2M_CIN extends M2MBase {
  ty: M2MType.ContentInstance,
  /**
   * unknown.
   * 
   * @todo fill
   */
  st: unknown | number,

  /**
   * Expire Time
   */
  et: DateString,
  /**
   * ConsistencyStrategy?
   */
  cs: number,
  /**
   * **Important**
   * 
   * Condition = Value
   */
  con: string,
  /**
   * Creator? Create? just refer `parent Id`
   */
  cr: string,
}

export type M2M_CINRes = {
  "m2m:cin": M2M_CIN,
}
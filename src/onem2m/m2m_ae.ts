import { M2MBase } from "./m2m_base";
import { DateString, M2M_Type } from "./m2m_type";

/**
 * oneM2M CSE(Common Service Entity) Base
 * 
 * `from`: Response pattern
 */
export interface M2M_AE extends M2MBase {
  ty: M2M_Type.ApplicationEntity,
  /**
   * Expire Time
   */
  et: DateString,
  /**
   * API string
   * 
   * Provided to `0.2.481.2.0001.001.000111`
   */
  api: string,
  /**
   * unknown (almost `true`)
   * @todo fill
   */
  rr: boolean,
  /**
   * CSE pointOfAccess
   * 
   * `Ex`: http://123.123.123.123:123
   */
  poa: string[],
  /**
   * Application Entity ID
   */
  aei: string,
}

export type M2M_AERes = {
  "m2m:ae": M2M_AE
} 
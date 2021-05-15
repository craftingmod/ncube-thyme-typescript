import { M2MBase } from "./m2m_base";
import { M2M_Type } from "./m2m_type";

/**
 * oneM2M CSE(Common Service Entity) Base
 * 
 * `from`: Response pattern
 */
export interface M2M_CB extends M2MBase {
  ty: M2M_Type.CSEBase,
  /**
   * CSE(Common Service Entity) Type
   */
  cst: 1,
  /**
   * CSE(Common Service Entity) Information
   */
  csi: string,
  /**
   * CSE Supported Resource Type
   */
  srt: number[],
  /**
   * CSE pointOfAccess
   * 
   * `Ex`: http://123.123.123.123:123
   */
  poa: string[],
  /**
   * Unknown.
   * 
   * @todo fill
   */
  srv: unknown[],
}

export type M2M_CBRes = {
  "m2m:cb": M2M_CB
} 
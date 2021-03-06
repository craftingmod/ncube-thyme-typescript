import { M2MBase } from "./m2m_base"
import { M2MType } from "./m2m_type"

/**
 * oneM2M Container Base
 *
 * `from`: Response pattern
 */
export interface M2M_SUB extends M2MBase {
  ty: M2MType.Subscribe
  /**
   * Nofication URL
   */
  nu: string[]
  /**
   * Condition
   */
  enc: {
    /**
     * Network?
     */
    net: number[]
  }
  /**
   * Unknown
   *
   * @todo fill
   */
  exc: unknown | number
  /**
   * Notification Content Type
   */
  nct: number
  /**
   * Creator
   */
  cr: string
}

export type M2M_SUBRes = {
  "m2m:sub": M2M_SUB
}

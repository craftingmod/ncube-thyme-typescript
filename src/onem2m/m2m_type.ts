/**
 * HTTP Mapping
 */

 export enum M2MType {
  /**
   * Application Entity
   */
  ApplicationEntity = 2,
  /**
   * Container
   */
  Container = 3,
  /**
   * Content Instance
   */
  ContentInstance = 4,
  /**
   * CSE(Common Service Entity) Base
   */ 
  CSEBase = 5,
  /**
   * Subscribe
   */
  Subscribe = 23,
}

export type DateString = string
export interface M2M_RSP<T> {
  /**
   * Response Code
   */
  rsc: number
  /**
   * Request ID
   */
  rqi: number | string
  /**
   * Response
   */
  pc: T
  /**
   * originator
   */
  to: string
  /**
   * destination
   */
  fr: string
}

export enum M2MStatusCode {
  ACCEPTED = 1000,
  OK = 2000,
  CREATED = 2001,
  DELETED = 2002,
  CHANGED = 2004,
  BAD_REQUEST = 4000,
  NOT_FOUND = 4004,
  ACCESS_DENIED = 4103,
  INTERNAL_SERVER_ERROR = 5000,
}

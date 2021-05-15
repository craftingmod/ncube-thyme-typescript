export interface M2M_Header {
  "Accept": "application/json"
  "X-M2M-RI": number,
  "X-M2M-Origin": string,
  "Content-Type"?: string,
}

export const defaultM2MHeader:M2M_Header = {
  "Accept": "application/json",
  "X-M2M-RI": 12345,
  "X-M2M-Origin": "SOrigin"
}
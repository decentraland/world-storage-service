export interface HTTPResponse<T = undefined> {
  status: number
  body?:
    | {
        message: string
      }
    | {
        value?: T
      }
}

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

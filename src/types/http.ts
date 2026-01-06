export interface HTTPResponse<T = undefined> {
  status: number
  body?:
    | {
        message: string
        data?: object
      }
    | {
        data?: T
      }
}

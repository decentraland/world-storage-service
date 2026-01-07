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

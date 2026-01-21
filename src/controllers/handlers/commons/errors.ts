export class MissingRequiredHeaderError extends Error {
  status: number

  constructor(headerName: string) {
    super(`Missing required header: ${headerName}`)
    this.name = 'MissingRequiredHeaderError'
    this.status = 400
  }
}

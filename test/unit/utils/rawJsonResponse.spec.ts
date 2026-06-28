import { rawJsonPaginatedResponse, rawJsonValueResponse } from '../../../src/utils/rawJsonResponse'

describe('rawJsonValueResponse', () => {
  describe('when wrapping a serialized object value', () => {
    it('should splice the value verbatim into a 200 application/json response', () => {
      expect(rawJsonValueResponse('{"a":1}')).toEqual({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"value":{"a":1}}'
      })
    })
  })

  describe('when wrapping a serialized string value', () => {
    it('should produce valid JSON that parses back to the original value', () => {
      const { body } = rawJsonValueResponse(JSON.stringify('hello'))
      expect(JSON.parse(body)).toEqual({ value: 'hello' })
    })
  })
})

describe('rawJsonPaginatedResponse', () => {
  describe('when wrapping a serialized data array', () => {
    it('should splice the data and pagination verbatim into a 200 application/json response', () => {
      expect(rawJsonPaginatedResponse('[{"key":"a","value":1}]', { limit: 100, offset: 0, total: 1 })).toEqual({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"data":[{"key":"a","value":1}],"pagination":{"limit":100,"offset":0,"total":1}}'
      })
    })
  })

  describe('when wrapping an empty data array', () => {
    it('should produce valid JSON that parses back to the expected shape', () => {
      const { body } = rawJsonPaginatedResponse('[]', { limit: 50, offset: 10, total: 0 })
      expect(JSON.parse(body)).toEqual({ data: [], pagination: { limit: 50, offset: 10, total: 0 } })
    })
  })
})

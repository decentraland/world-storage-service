import { InvalidRequestError } from '@dcl/http-commons'
import { parseExportFormat } from '../../../../../src/controllers/handlers/commons/parseExportFormat'

describe('parseExportFormat', () => {
  let url: URL

  describe('when the format is json', () => {
    beforeEach(() => {
      url = new URL('http://localhost/exports?format=json')
    })

    it('should return json', () => {
      expect(parseExportFormat(url)).toBe('json')
    })
  })

  describe('when the format is csv', () => {
    beforeEach(() => {
      url = new URL('http://localhost/exports?format=csv')
    })

    it('should return csv', () => {
      expect(parseExportFormat(url)).toBe('csv')
    })
  })

  describe.each([
    ['missing', 'http://localhost/exports'],
    ['uppercase', 'http://localhost/exports?format=JSON'],
    ['not allowlisted', 'http://localhost/exports?format=xml'],
    ['repeated', 'http://localhost/exports?format=json&format=json']
  ])('when the format is %s', (_label, href) => {
    beforeEach(() => {
      url = new URL(href)
    })

    it('should throw an InvalidRequestError listing the allowed formats', () => {
      expect(() => parseExportFormat(url)).toThrow(new InvalidRequestError('format must be one of: json, csv'))
    })
  })
})

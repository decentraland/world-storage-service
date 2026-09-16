import { extractLogsPermissions, filterStringEntries } from '../../../src/logic/logs-permissions'

describe('filterStringEntries', () => {
  describe('when the value is an array with mixed entry types', () => {
    it('should keep only the string entries', () => {
      const result = filterStringEntries([123, null, '0xAbC', undefined, 'valid'])

      expect(result).toEqual(['0xAbC', 'valid'])
    })
  })

  describe('when the value is not an array', () => {
    it('should return an empty array for undefined', () => {
      expect(filterStringEntries(undefined)).toEqual([])
    })

    it('should return an empty array for an object', () => {
      expect(filterStringEntries({ foo: 'bar' })).toEqual([])
    })
  })
})

describe('extractLogsPermissions', () => {
  describe('when metadata is missing', () => {
    it('should return an empty array', () => {
      expect(extractLogsPermissions(undefined)).toEqual([])
    })
  })

  describe('when metadata.logsPermissions is not an array', () => {
    it('should return an empty array', () => {
      expect(extractLogsPermissions({ logsPermissions: 'not-an-array' })).toEqual([])
    })
  })

  describe('when metadata.logsPermissions has non-string entries', () => {
    it('should drop the non-string entries', () => {
      const result = extractLogsPermissions({ logsPermissions: [123, null, '0xAbC'] })

      expect(result).toEqual(['0xabc'])
    })
  })

  describe('when metadata.logsPermissions has valid addresses with mixed casing', () => {
    it('should lowercase every entry', () => {
      const result = extractLogsPermissions({ logsPermissions: ['0xAbC', '0xDEF'] })

      expect(result).toEqual(['0xabc', '0xdef'])
    })
  })
})

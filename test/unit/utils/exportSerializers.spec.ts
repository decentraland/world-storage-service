import { serializeCsvExport, serializeJsonExport } from '../../../src/utils/exportSerializers'
import type { PlayerExportRow, WorldExportRow } from '../../../src/utils/exportSerializers'

async function* fromRows<T>(rows: T[]): AsyncGenerator<T> {
  for (const row of rows) {
    yield await Promise.resolve(row)
  }
}

async function collect(chunks: AsyncGenerator<string>): Promise<string> {
  let output = ''
  for await (const chunk of chunks) {
    output += chunk
  }
  return output
}

describe('when serializing a JSON export', () => {
  let worldRows: WorldExportRow[]
  let playerRows: PlayerExportRow[]
  let output: string

  describe('and there are no world or player rows', () => {
    beforeEach(async () => {
      worldRows = []
      playerRows = []
      output = await collect(serializeJsonExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should produce empty world and players lists', () => {
      expect(output).toBe('{"world":[],"players":[]}')
    })
  })

  describe('and there are two world rows and two player rows', () => {
    beforeEach(async () => {
      worldRows = [
        { key: 'a', value: '1' },
        { key: 'b', value: '{"x":"y"}' }
      ]
      playerRows = [
        { player_address: '0xa', key: 'k', value: '"s"' },
        { player_address: '0xb', key: 'm', value: '[1, 2]' }
      ]
      output = await collect(serializeJsonExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should splice the stored values in as raw JSON separated by commas', () => {
      expect(output).toBe(
        '{"world":[{"key":"a","value":1},{"key":"b","value":{"x":"y"}}],' +
          '"players":[{"address":"0xa","key":"k","value":"s"},{"address":"0xb","key":"m","value":[1, 2]}]}'
      )
    })

    it('should parse back to the exported rows', () => {
      expect(JSON.parse(output)).toEqual({
        world: [
          { key: 'a', value: 1 },
          { key: 'b', value: { x: 'y' } }
        ],
        players: [
          { address: '0xa', key: 'k', value: 's' },
          { address: '0xb', key: 'm', value: [1, 2] }
        ]
      })
    })
  })

  describe('and a key contains a quote and a newline', () => {
    beforeEach(async () => {
      worldRows = [{ key: 'a"b\nc', value: '1' }]
      playerRows = [{ player_address: '0xa', key: 'k"\n', value: '2' }]
      output = await collect(serializeJsonExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should escape the keys so the output parses back to the original keys', () => {
      expect(JSON.parse(output)).toEqual({
        world: [{ key: 'a"b\nc', value: 1 }],
        players: [{ address: '0xa', key: 'k"\n', value: 2 }]
      })
    })
  })
})

describe('when serializing a CSV export', () => {
  let worldRows: WorldExportRow[]
  let playerRows: PlayerExportRow[]
  let output: string

  beforeEach(() => {
    worldRows = []
    playerRows = []
  })

  describe('and there are no world or player rows', () => {
    beforeEach(async () => {
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should produce only the header line', () => {
      expect(output).toBe('scope,player_address,key,value\r\n')
    })
  })

  describe('and there is a world row with a plain value', () => {
    beforeEach(async () => {
      worldRows = [{ key: 'a', value: '1' }]
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should write a world row with an empty player address', () => {
      expect(output).toBe('scope,player_address,key,value\r\nworld,,a,1\r\n')
    })
  })

  describe('and there is a world row whose value is a JSON object', () => {
    beforeEach(async () => {
      worldRows = [{ key: 'a', value: '{"a":1}' }]
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should quote the value and double its inner quotes', () => {
      expect(output).toBe('scope,player_address,key,value\r\nworld,,a,"{""a"":1}"\r\n')
    })
  })

  describe('and there is a player row', () => {
    beforeEach(async () => {
      playerRows = [{ player_address: '0xa', key: 'k', value: '"s"' }]
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should write a player row with the address and the quoted JSON string', () => {
      expect(output).toBe('scope,player_address,key,value\r\nplayer,0xa,k,"""s"""\r\n')
    })
  })

  describe('and there are world and player rows', () => {
    beforeEach(async () => {
      worldRows = [{ key: 'w', value: '1' }]
      playerRows = [{ player_address: '0xa', key: 'p', value: '2' }]
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should write the world rows before the player rows', () => {
      expect(output).toBe('scope,player_address,key,value\r\nworld,,w,1\r\nplayer,0xa,p,2\r\n')
    })
  })

  describe.each([
    ['a comma', 'a,b', '"a,b"'],
    ['a quote', 'a"b', '"a""b"'],
    ['a carriage return', 'a\rb', '"a\rb"'],
    ['a line feed', 'a\nb', '"a\nb"']
  ])('and a key contains %s', (_description, key, expectedCell) => {
    beforeEach(async () => {
      worldRows = [{ key, value: '1' }]
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should wrap the key in quotes with inner quotes doubled', () => {
      expect(output).toBe(`scope,player_address,key,value\r\nworld,,${expectedCell},1\r\n`)
    })
  })

  describe.each([
    ['=', '=SUM(A1)', "'=SUM(A1)"],
    ['+', '+1', "'+1"],
    ['-', '-1', "'-1"],
    ['@', '@cmd', "'@cmd"],
    ['a tab', '\tcmd', "'\tcmd"],
    ['a carriage return', '\rcmd', '"\'\rcmd"']
  ])('and a key starts with %s', (_description, key, expectedCell) => {
    beforeEach(async () => {
      playerRows = [{ player_address: '0xa', key, value: '1' }]
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should prefix the key with a single quote and quote it when needed', () => {
      expect(output).toBe(`scope,player_address,key,value\r\nplayer,0xa,${expectedCell},1\r\n`)
    })
  })

  describe('and a value is a negative number', () => {
    beforeEach(async () => {
      worldRows = [{ key: 'a', value: '-5' }]
      output = await collect(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
    })

    it('should leave the value unchanged', () => {
      expect(output).toBe('scope,player_address,key,value\r\nworld,,a,-5\r\n')
    })
  })
})

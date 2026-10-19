export interface WorldExportRow {
  key: string
  value: string
}

export interface PlayerExportRow {
  player_address: string
  key: string
  value: string
}

function csvCell(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

function neutralizeFormula(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell
}

/** Streams `{"world":[…],"players":[…]}` with stored values spliced in as raw JSON; world rows are drained first. */
export async function* serializeJsonExport(
  world: AsyncIterable<WorldExportRow>,
  players: AsyncIterable<PlayerExportRow>
): AsyncGenerator<string> {
  yield '{"world":['
  let separator = ''
  for await (const { key, value } of world) {
    yield `${separator}{"key":${JSON.stringify(key)},"value":${value}}`
    separator = ','
  }
  yield '],"players":['
  separator = ''
  for await (const { player_address, key, value } of players) {
    yield `${separator}{"address":${JSON.stringify(player_address)},"key":${JSON.stringify(key)},"value":${value}}`
    separator = ','
  }
  yield ']}'
}

/** Streams RFC 4180 CSV rows `scope,player_address,key,value` with formula-neutralized keys; world rows are drained first. */
export async function* serializeCsvExport(
  world: AsyncIterable<WorldExportRow>,
  players: AsyncIterable<PlayerExportRow>
): AsyncGenerator<string> {
  yield 'scope,player_address,key,value\r\n'
  for await (const { key, value } of world) {
    yield `world,,${csvCell(neutralizeFormula(key))},${csvCell(value)}\r\n`
  }
  for await (const { player_address, key, value } of players) {
    yield `player,${csvCell(player_address)},${csvCell(neutralizeFormula(key))},${csvCell(value)}\r\n`
  }
}

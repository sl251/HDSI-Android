import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const root = process.cwd().replaceAll('\\', '/')
const file = ts.readConfigFile('tsconfig.runtime.json', ts.sys.readFile)
if (file.error) throw new Error(ts.flattenDiagnosticMessageText(file.error.messageText, '\n'))
const config = ts.parseJsonConfigFileContent(file.config, ts.sys, process.cwd())
const program = ts.createProgram(config.fileNames, config.options)
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)]
const own = diagnostics.filter(item => !item.file || !relative(process.cwd(), item.file.fileName).replaceAll('\\', '/').startsWith('upstream/'))
const upstream = diagnostics.filter(item => !own.includes(item)).map(item => {
  const position = item.file.getLineAndCharacterOfPosition(item.start ?? 0)
  const escapedRoot = root.replace(/[^\x00-\x7f]/g, value => `\\u${value.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
  return { file: relative(process.cwd(), item.file.fileName).replaceAll('\\', '/'), code: item.code,
    line: position.line + 1, column: position.character + 1,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n').replaceAll(root, '<repo>').replaceAll(escapedRoot, '<repo>') }
})
const baselinePath = resolve('scripts/upstream-typecheck-baseline.json')
if (process.argv.includes('--update-upstream-baseline')) {
  if (process.env.CI || own.length) throw new Error('Baseline updates require a local run with no application runtime type errors.')
  writeFileSync(baselinePath, JSON.stringify(upstream, null, 2) + '\n')
  console.log(`Captured ${upstream.length} existing upstream diagnostics. Review this diff before committing.`)
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const expected = new Map(baseline.map(item => [JSON.stringify(item), item]))
  const added = upstream.filter(item => !expected.delete(JSON.stringify(item)))
  if (own.length) console.error(ts.formatDiagnosticsWithColorAndContext(own, { getCanonicalFileName: value => value, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }))
  if (added.length) console.error('New upstream type errors (not in the reviewed baseline):\n' + JSON.stringify(added, null, 2))
  if (expected.size) console.error(`${expected.size} upstream diagnostics changed or were fixed; review and refresh the baseline.`)
  if (own.length || added.length || expected.size) process.exitCode = 1
  else console.log(`Runtime typecheck passed; ${upstream.length} existing upstream diagnostics match the reviewed baseline.`)
}

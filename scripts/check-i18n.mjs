// Kiểm hai ngôn ngữ (chạy trong `npm test`):
//  1. mọi chuỗi trong t('…') đều có bản dịch tiếng Anh (src/i18n/en/*.ts), cùng bộ biến {…}
//  2. không còn chữ tiếng Việt (có dấu) nằm trần trong giao diện — phải bọc t(), hoặc ghi cuối dòng:
//     `// i18n-ok`  cố ý giữ tiếng Việt (dữ liệu, tiêu đề cột file Excel mẫu, chữ thuật toán dịch bằng tx())
//     `// i18n-key` nhãn khai ở cấp module, lúc vẽ mới gọi t(nhãn) — vẫn phải có trong bảng dịch
import ts from 'typescript'
import { buildSync } from 'esbuild'
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'malcargo-i18n-'))
buildSync({ entryPoints: ['src/i18n/en.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'en.mjs'), logLevel: 'error' })
const { EN } = await import(pathToFileURL(join(dir, 'en.mjs')).href)
rmSync(dir, { recursive: true, force: true })

// không quét: lõi thuật toán chép từ SUPPLYC, dữ liệu mẫu (tên dịch ở EN_NAMES), chính bảng dịch
const SKIP = [/src[\\/]engine[\\/]loadPlan\.ts$/, /src[\\/]data[\\/]catalog\.ts$/, /src[\\/]i18n[\\/]/]
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [] })
const files = walk('src').filter(f => !SKIP.some(r => r.test(f)))

const missing = new Map(), bare = [], badVars = []
// bộ biến (không lặp) — '{n} {n:carton|cartons}' và '{n} thùng' cùng một biến n
const vars = s => [...new Set([...s.matchAll(/\{(\w+)(?::[^}]*)?\}/g)].map(m => m[1]))].sort().join(',')
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  const lines = text.split(/\r?\n/)
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const lineOf = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line
  const ok = n => /\/\/\s*i18n-ok/.test(lines[lineOf(n)] ?? '')
  const keyLine = n => /\/\/\s*i18n-key/.test(lines[lineOf(n)] ?? '')
  const isTArg = n => {
    const p = n.parent
    return p && ts.isCallExpression(p) && p.arguments[0] === n && ts.isIdentifier(p.expression) && p.expression.text === 't'
  }
  const visit = n => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (isTArg(n) || (keyLine(n) && VI.test(n.text))) {
        const k = n.text
        if (EN[k] == null) missing.set(k, `${f}:${lineOf(n) + 1}`)
        else if (vars(k) !== vars(EN[k])) badVars.push(`${f}:${lineOf(n) + 1}  "${k}" ↔ "${EN[k]}"`)
      } else if (VI.test(n.text) && !ok(n) && !ts.isImportDeclaration(n.parent)) bare.push(`${f}:${lineOf(n) + 1}  ${JSON.stringify(n.text).slice(0, 90)}`)
    } else if (ts.isTemplateExpression(n)) {
      const raw = n.getText(sf)
      if (VI.test(raw.replace(/\$\{[^}]*\}/g, '')) && !ok(n)) bare.push(`${f}:${lineOf(n) + 1}  ${raw.slice(0, 90)} (dùng t('…{x}…', { x }))`)
    } else if (ts.isJsxText(n)) {
      if (VI.test(n.text) && !ok(n)) bare.push(`${f}:${lineOf(n) + 1}  ${JSON.stringify(n.text.trim()).slice(0, 90)}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

let fail = 0
if (missing.size) { fail += missing.size; console.log(`✗ ${missing.size} chuỗi t() chưa có bản dịch tiếng Anh:`); for (const [k, at] of missing) console.log(`    ${at}  ${JSON.stringify(k)}`) }
if (badVars.length) { fail += badVars.length; console.log(`✗ ${badVars.length} bản dịch lệch biến {…}:`); for (const l of badVars) console.log('    ' + l) }
if (bare.length) { fail += bare.length; console.log(`✗ ${bare.length} chữ tiếng Việt chưa bọc t():`); for (const l of bare) console.log('    ' + l) }
console.log(fail ? `\n${fail} lỗi ngôn ngữ` : `XANH — ${Object.keys(EN).length} chuỗi đã dịch, không còn chữ tiếng Việt trần`)
process.exit(fail ? 1 : 0)

const XLSX = require('@e965/xlsx')
const { unzipSync, strFromU8 } = require('fflate')

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function docxText(data) {
  const files = unzipSync(new Uint8Array(data))
  const document = files['word/document.xml']
  if (!document) throw new Error('DOCX 中没有找到正文，请确认文件未损坏')
  const xml = strFromU8(document)
  return decodeXml(xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n'))
    .trim()
}

function workbookText(data) {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false })
  return workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { FS: '\t', RS: '\n', blankrows: false })
    return `--- 工作表：${name} ---\n${rows}`
  }).join('\n\n').trim()
}

function plainText(data) {
  return strFromU8(new Uint8Array(data)).replace(/^\uFEFF/, '').trim()
}

function extractOfficeText(arrayBuffer, extension) {
  const type = String(extension || '').toLowerCase()
  if (type === 'docx') return docxText(arrayBuffer)
  if (type === 'xlsx' || type === 'xls') return workbookText(arrayBuffer)
  if (type === 'txt' || type === 'csv') return plainText(arrayBuffer)
  throw new Error(`不支持的课表文件类型：.${type}`)
}

module.exports = { extractOfficeText }

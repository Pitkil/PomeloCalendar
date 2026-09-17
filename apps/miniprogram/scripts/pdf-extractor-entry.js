const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js')
globalThis.pdfjsWorker = pdfjsWorker

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
const uniGbCMap = require('pdfjs-dist/cmaps/UniGB-UCS2-H.bcmap')
const adobeGbCMap = require('pdfjs-dist/cmaps/Adobe-GB1-UCS2.bcmap')

const cMaps = {
  'UniGB-UCS2-H': uniGbCMap,
  'Adobe-GB1-UCS2': adobeGbCMap
}

class BundledCMapReaderFactory {
  fetch({ name }) {
    const encoded = cMaps[name]
    if (!encoded) return Promise.reject(new Error(`课表使用了暂不支持的 PDF 字体映射：${name}`))
    return Promise.resolve({ cMapData: decodeBase64(encoded), compressionType: 1 })
  }
}

function decodeBase64(encoded) {
  const binary = typeof wx !== 'undefined' && wx.base64ToArrayBuffer
    ? new Uint8Array(wx.base64ToArrayBuffer(encoded))
    : new Uint8Array(Buffer.from(encoded, 'base64'))
  return binary
}

function pageText(items) {
  const rows = []
  items.forEach((item) => {
    const text = String(item.str || '').trim()
    if (!text) return
    const x = Number(item.transform && item.transform[4]) || 0
    const y = Number(item.transform && item.transform[5]) || 0
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2)
    if (!row) {
      row = { y, cells: [] }
      rows.push(row)
    }
    row.cells.push({ x, text })
  })

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(' | '))
    .join('\n')
}

async function extractPdfText(arrayBuffer) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    CMapReaderFactory: BundledCMapReaderFactory,
    cMapPacked: true,
    disableWorker: true,
    useSystemFonts: true
  })
  const document = await loadingTask.promise
  const pages = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent({ normalizeWhitespace: true })
      pages.push(`--- 第 ${pageNumber} 页 ---\n${pageText(content.items)}`)
      page.cleanup()
    }
  } finally {
    if (document.destroy) await document.destroy()
  }
  return pages.join('\n\n').trim()
}

module.exports = { extractPdfText }

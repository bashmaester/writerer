import mammoth from 'mammoth'
import TurndownService from 'turndown'

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

export const ACCEPTED =
  '.pdf,.docx,.doc,.md,.markdown,.txt,.text,.rtf,.html,.htm,.csv,.json'

async function readPdf(file: File): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let last = 0
    let line = ''
    const lines: string[] = []
    for (const item of content.items as any[]) {
      if (!('str' in item)) continue
      const y = item.transform[5]
      if (last && Math.abs(y - last) > 4) {
        lines.push(line.trim())
        line = ''
      }
      line += item.str + (item.hasEOL ? ' ' : '')
      last = y
    }
    if (line.trim()) lines.push(line.trim())
    pages.push(lines.join('\n'))
  }
  return pages.join('\n\n')
}

async function readDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buf })
  return td.turndown(value)
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return readPdf(file)
  if (name.endsWith('.docx') || name.endsWith('.doc')) return readDocx(file)
  if (name.endsWith('.html') || name.endsWith('.htm')) return td.turndown(await file.text())
  return file.text()
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function exportText(text: string, filename: string, mime = 'text/plain') {
  download(new Blob([text], { type: `${mime};charset=utf-8` }), filename)
}

export async function exportHtml(markdown: string, filename: string) {
  const { marked } = await import('marked')
  const body = await marked.parse(markdown)
  const html = `<!doctype html><meta charset="utf-8"><title>${filename}</title>
<style>body{font:16px/1.6 Georgia,serif;max-width:46rem;margin:3rem auto;padding:0 1rem}
h1,h2,h3{font-family:system-ui,sans-serif}blockquote{border-left:3px solid #ccc;margin:0;padding-left:1rem;color:#555}
code{background:#f4f4f5;padding:.1em .3em;border-radius:3px}</style>
${body}`
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), filename)
}

export async function exportDocx(markdown: string, filename: string) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx')
  const paras: any[] = []
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      paras.push(new Paragraph({ text: '' }))
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const lv = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][
        h[1].length - 1
      ]
      paras.push(new Paragraph({ text: h[2], heading: lv }))
      continue
    }
    const li = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line)
    if (li) {
      paras.push(
        new Paragraph({
          text: li[2].replace(/\*\*/g, ''),
          bullet: { level: 0 },
        }),
      )
      continue
    }
    if (line.startsWith('> ')) {
      paras.push(new Paragraph({ children: [new TextRun({ text: line.slice(2), italics: true })] }))
      continue
    }
    paras.push(new Paragraph({ children: [new TextRun(line.replace(/\*\*/g, ''))] }))
  }
  const doc = new Document({ sections: [{ children: paras }] })
  download(await Packer.toBlob(doc), filename)
}

export async function exportPdf(markdown: string, filename: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 56
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const bottom = doc.internal.pageSize.getHeight() - margin
  let y = margin
  const put = (text: string, size: number, bold: boolean) => {
    doc.setFont('times', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    for (const line of doc.splitTextToSize(text, width)) {
      if (y > bottom) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += size * 1.45
    }
  }
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      y += 8
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      y += 8
      put(h[2], [20, 16, 14, 12][h[1].length - 1], true)
      continue
    }
    put(line.replace(/\*\*/g, ''), 11.5, false)
  }
  doc.save(filename)
}

export function wordCount(s: string) {
  return (s.trim().match(/\S+/g) ?? []).length
}

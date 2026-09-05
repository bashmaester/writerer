import TurndownService from 'turndown'

/**
 * Import a web page (blog post, style guide, docs page) as reference text.
 *
 * A static site cannot fetch arbitrary origins: almost no site sends
 * Access-Control-Allow-Origin for us. So we try, in order:
 *   1. a direct fetch (works for CORS-open sites, raw.githubusercontent, APIs)
 *   2. text-extraction readers that return clean Markdown
 *   3. generic CORS proxies returning raw HTML, which we convert locally
 * The first strategy that yields usable text wins.
 */

export interface FetchedPage {
  title: string
  text: string
  url: string
  via: string
}

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
td.remove(['script', 'style', 'noscript', 'iframe', 'form'])

export function normalizeUrl(input: string): string {
  const s = input.trim()
  if (!s) throw new Error('Enter a URL.')
  // Reject other schemes outright rather than mangling them into an https URL.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)
  if (scheme && !/^https?$/i.test(scheme[1]))
    throw new Error(`Only http(s) URLs are supported (got "${scheme[1]}:").`)
  const withScheme = scheme ? s : `https://${s}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    throw new Error(`"${input}" is not a valid URL.`)
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are supported.')
  return u.toString()
}

/** Strip chrome (nav/header/footer/aside) and convert the main content to Markdown. */
function htmlToText(html: string, url: string): { title: string; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('title')?.textContent?.trim() ||
    new URL(url).hostname

  doc
    .querySelectorAll(
      'script,style,noscript,iframe,svg,form,nav,header,footer,aside,' +
        '[role="navigation"],[role="banner"],[role="contentinfo"],' +
        '.nav,.navbar,.menu,.sidebar,.footer,.header,.cookie,.banner,.advert,.ads,.social,.share,.comments',
    )
    .forEach((el) => el.remove())

  // Prefer a semantic main-content container when one exists.
  const main =
    doc.querySelector('article') ??
    doc.querySelector('main') ??
    doc.querySelector('[role="main"]') ??
    doc.querySelector('.post-content, .entry-content, .markdown-body, #content, .content') ??
    doc.body

  let text = ''
  try {
    text = td.turndown(main?.innerHTML ?? '')
  } catch {
    text = main?.textContent ?? ''
  }
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
  return { title, text }
}

const MIN_USEFUL = 200

type Strategy = {
  name: string
  url: (u: string) => string
  /** 'markdown' responses are already clean; 'html' needs local conversion. */
  kind: 'markdown' | 'html' | 'auto'
  headers?: Record<string, string>
}

const STRATEGIES: Strategy[] = [
  { name: 'direct', url: (u) => u, kind: 'auto' },
  // Reader services that do the extraction server-side and return Markdown.
  { name: 'r.jina.ai', url: (u) => `https://r.jina.ai/${u}`, kind: 'markdown' },
  // Generic CORS proxies returning the original bytes.
  {
    name: 'allorigins',
    url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    kind: 'html',
  },
  { name: 'corsproxy.io', url: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, kind: 'html' },
  { name: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`, kind: 'html' },
]

async function withTimeout(url: string, ms: number, headers?: Record<string, string>) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { signal: ac.signal, headers, redirect: 'follow' })
  } finally {
    clearTimeout(t)
  }
}

/** PDFs served over http need the binary path, not the HTML path. */
async function pdfFromResponse(res: Response, url: string): Promise<FetchedPage | null> {
  const ct = res.headers.get('content-type') ?? ''
  const isPdf = ct.includes('application/pdf') || /\.pdf($|\?)/i.test(url)
  if (!isPdf) return null
  const buf = await res.arrayBuffer()
  const pdfjs: any = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const c = await page.getTextContent()
    out.push((c.items as any[]).map((it) => ('str' in it ? it.str : '')).join(' '))
  }
  return {
    title: new URL(url).pathname.split('/').pop() || url,
    text: out.join('\n\n').replace(/[ \t]{2,}/g, ' ').trim(),
    url,
    via: 'pdf',
  }
}

export async function fetchUrlAsDoc(
  rawUrl: string,
  onProgress?: (s: string) => void,
): Promise<FetchedPage> {
  const url = normalizeUrl(rawUrl)
  const errors: string[] = []

  for (const s of STRATEGIES) {
    try {
      onProgress?.(s.name === 'direct' ? 'Fetching…' : `Retrying via ${s.name}…`)
      const res = await withTimeout(s.url(url), 25000, s.headers)
      if (!res.ok) {
        errors.push(`${s.name}: HTTP ${res.status}`)
        continue
      }

      const asPdf = await pdfFromResponse(res.clone(), url).catch(() => null)
      if (asPdf && asPdf.text.length > MIN_USEFUL) return asPdf

      const body = await res.text()
      if (!body.trim()) {
        errors.push(`${s.name}: empty response`)
        continue
      }

      const looksHtml = /<\/?(html|body|div|p|article)\b/i.test(body.slice(0, 2000))
      let title: string
      let text: string

      if (s.kind === 'markdown' && !looksHtml) {
        text = body.trim()
        // r.jina.ai puts "Title: ..." on the first line.
        const m = /^Title:\s*(.+)$/m.exec(text.slice(0, 400))
        title = m ? m[1].trim() : new URL(url).hostname
      } else if (looksHtml) {
        ;({ title, text } = htmlToText(body, url))
      } else {
        text = body.trim()
        title = new URL(url).pathname.split('/').pop() || new URL(url).hostname
      }

      if (text.length < MIN_USEFUL) {
        errors.push(`${s.name}: only ${text.length} chars extracted`)
        continue
      }
      return { title: title || url, text, url, via: s.name }
    } catch (e: any) {
      errors.push(`${s.name}: ${e?.name === 'AbortError' ? 'timed out' : (e?.message ?? e)}`)
    }
  }

  throw new Error(
    `Could not import ${url}.\n\nTried ${STRATEGIES.length} routes:\n${errors
      .map((e) => `  • ${e}`)
      .join('\n')}\n\nSites that require login, block bots, or render purely via JavaScript often can't be imported. Workaround: open the page, copy the text, and paste it in as a reference — or save it as PDF and upload that.`,
  )
}

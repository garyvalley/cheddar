// A minimal PDF writer for the tests: pages of text lines placed where a
// bank's statement would put them, in Helvetica, so pdf.js reads them as it
// would a real statement. Not a test file itself.

/**
 * A PDF's bytes. Each page is a list of [x, y, text] (points from the
 * bottom-left of a US Letter page) or `cells`: [y, [[x, text], ...]].
 */
export function makePdf(pages) {
  const objects = []
  const add = (body) => { objects.push(body); return objects.length }
  const esc = s => s.replace(/[\\()]/g, c => `\\${c}`)
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const pagesId = objects.length + 1 + pages.length * 2
  const kids = []
  for (const page of pages) {
    const ops = []
    for (const [y, cells] of page) {
      for (const [x, text] of cells) ops.push(`BT /F1 10 Tf ${x} ${y} Td (${esc(text)}) Tj ET`)
    }
    const stream = ops.join('\n')
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`)
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`))
  }
  add(`<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** Rows of a statement as page lines: each row is [y, [[x, text], ...]], top down from `top`. */
export function rows(top, list, step = 14) {
  return list.map((cells, i) => [top - i * step, cells])
}

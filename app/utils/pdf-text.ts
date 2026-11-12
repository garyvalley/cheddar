import { pdfPages, pdfText } from '~~/shared/pdf-statements'

/** Larger than any bank's monthly PDF; the text sent from it is far smaller. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024

/**
 * The text of a PDF statement, as shared/pdf-statements.ts reads it, taken
 * out in the browser with pdf.js: the PDF itself is never uploaded. pdf.js
 * loads the first time someone chooses a PDF, and runs in a worker served
 * from Cheddar itself, so the CSP needs nothing new. Throws an Error whose
 * message is for the person.
 */
export async function textOfPdf(file: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    let doc
    try {
      doc = await task.promise
    }
    catch (error) {
      const name = (error as { name?: string }).name
      throw new Error(name === 'PasswordException'
        ? 'This PDF is protected with a password. Download it again without one, or export CSV from your bank instead.'
        : 'This file couldn\'t be opened as a PDF.', { cause: error })
    }
    return pdfText(await pdfPages(doc))
  }
  finally {
    await task.destroy()
  }
}

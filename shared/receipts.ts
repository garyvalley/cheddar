/**
 * Receipts on transactions (issue #113): a photo or a PDF kept with a
 * transaction, for warranties, returns and reimbursements. Kept at full
 * size in PocketBase's file storage (migrations/0039_receipts.mjs), which
 * k8s/backup/files.yaml backs up. Built for the hooks (scripts/gen-hooks.mjs),
 * which count them: no Intl, DOM or Node.
 */

/** A receipt's file, at most. A larger photo is made smaller in the browser first. */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
/** Receipts one transaction can have. */
export const RECEIPTS_PER_TRANSACTION = 5
/** Receipts one person can keep in all. */
export const RECEIPTS_PER_PERSON = 500
export const RECEIPT_NAME_MAX = 100

export const RECEIPT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}

const starts = (b: Uint8Array, at: number, text: string) =>
  b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0))

/** The kind of file `bytes` is, by how it starts, or "". */
export function sniff(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  if (bytes[0] === 0x89 && starts(bytes, 1, 'PNG')) return 'image/png'
  if (starts(bytes, 0, 'RIFF') && starts(bytes, 8, 'WEBP')) return 'image/webp'
  if (starts(bytes, 0, '%PDF-')) return 'application/pdf'
  if (starts(bytes, 4, 'ftyp')) {
    const brand = String.fromCharCode(...bytes.slice(8, 12))
    if (['heic', 'heix', 'heim', 'heis'].includes(brand)) return 'image/heic'
    if (['mif1', 'msf1', 'heif'].includes(brand)) return 'image/heif'
  }
  return ''
}

/** A receipt's name as it's kept: no control characters, quotes or slashes. */
export function receiptName(name: unknown, type: string): string {
  const clean = [...(typeof name === 'string' ? name : '')]
    .map(c => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '"\\/'.includes(c) ? ' ' : c))
    .join('').replace(/\s+/g, ' ').trim().slice(0, RECEIPT_NAME_MAX)
  return clean || `Receipt.${RECEIPT_TYPES[type] ?? 'bin'}`
}

/**
 * A receipt's file as sent: what it is is read from its first bytes, never
 * taken from the browser. Answers its type and name, or a problem in words.
 */
export function checkReceipt(name: unknown, bytes: Uint8Array): { ok: { name: string, type: string } } | { problem: string } {
  if (!bytes.length) return { problem: 'Choose the receipt again: the file was empty.' }
  if (bytes.length > RECEIPT_MAX_BYTES) return { problem: `A receipt can be at most ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.` }
  const type = sniff(bytes)
  if (!type) return { problem: 'A receipt is a photo (JPEG, PNG, WebP or HEIC) or a PDF.' }
  return { ok: { name: receiptName(name, type), type } }
}

/** A receipt's file name in an export: its transaction's date, then its own name. */
export function receiptFileName(posted: string, id: string, name: string, type: string): string {
  const ext = RECEIPT_TYPES[type] ?? 'bin'
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9 ._-]+/g, '').trim().slice(0, 60) || 'receipt'
  return `${posted.slice(0, 10)} ${base} ${id}.${ext}`
}

/** A receipt as the pages list it: its file is fetched on its own (GET /api/receipts/:id). */
export interface Receipt {
  id: string
  transaction: string
  name: string
  type: string
  size: number
  created: string
}

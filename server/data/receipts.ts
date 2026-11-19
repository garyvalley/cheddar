import type { RecordModel } from 'pocketbase'
import type { Receipt } from '~~/shared/receipts'
import { callerId, type Session } from './session'

/**
 * Receipts on the caller's own transactions (shared/receipts.ts), always as
 * the signed-in person: PocketBase's rules (migrations/0039_receipts.mjs)
 * keep each to its owner, and its file is protected, so it's fetched with a
 * file token of theirs.
 */

// collectionId and collectionName: getURL() builds the file address from them.
const LISTED = 'id,collectionId,collectionName,transaction,name,type,size,created,file'

const toReceipt = (r: RecordModel): Receipt => ({
  id: r.id,
  transaction: r.transaction,
  name: r.name ?? '',
  type: r.type,
  size: r.size ?? 0,
  created: r.created,
})

export async function listReceipts(s: Session, transaction: string): Promise<Receipt[]> {
  return (
    await s.collection('receipts').getFullList({
      fields: LISTED,
      sort: 'created,id',
      filter: s.filter('transaction = {:transaction}', { transaction }),
    })
  ).map(toReceipt)
}

/** Every receipt the caller has, oldest first, with what fetches each file. */
export async function allReceipts(s: Session): Promise<{ receipt: Receipt, file: () => Promise<Uint8Array> }[]> {
  const rows = await s.collection('receipts').getFullList({
    fields: LISTED,
    sort: 'created,id',
    filter: s.filter('owner = {:owner}', { owner: callerId(s) }),
  })
  let token = ''
  return rows.map(r => ({
    receipt: toReceipt(r),
    file: async () => {
      token ||= await s.files.getToken()
      return new Uint8Array(await fetched(s.files.getURL(r, r.file, { token })))
    },
  }))
}

async function fetched(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url)
  if (!r.ok) throw Object.assign(new Error(`receipt file: ${r.status}`), { status: r.status === 404 ? 404 : 502 })
  return await r.arrayBuffer()
}

export async function addReceipt(
  s: Session,
  transaction: string,
  file: { name: string, type: string, bytes: Uint8Array },
): Promise<Receipt> {
  const form = new FormData()
  form.set('owner', callerId(s))
  form.set('transaction', transaction)
  form.set('name', file.name)
  form.set('type', file.type)
  form.set('size', String(file.bytes.length))
  form.set('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name)
  return toReceipt(await s.collection('receipts').create(form, { fields: LISTED }))
}

/** One receipt's file. */
export async function receiptFile(
  s: Session,
  id: string,
): Promise<{ name: string, type: string, bytes: Buffer }> {
  const r = await s.collection('receipts').getOne(id, { fields: LISTED })
  const token = await s.files.getToken()
  return { name: r.name ?? '', type: r.type, bytes: Buffer.from(await fetched(s.files.getURL(r, r.file, { token }))) }
}

export async function deleteReceipt(s: Session, id: string): Promise<void> {
  await s.collection('receipts').delete(id)
}

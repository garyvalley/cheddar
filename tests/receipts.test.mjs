// Receipts on transactions (shared/receipts.ts): what a receipt may be.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkReceipt, RECEIPT_MAX_BYTES, receiptFileName, receiptName, sniff } from '../shared/receipts.ts'

const bytes = (...parts) => new Uint8Array(Buffer.concat(parts.map(p => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))))

test('sniff: what a file is, by how it starts', () => {
  assert.equal(sniff(bytes([0xFF, 0xD8, 0xFF, 0xE0])), 'image/jpeg')
  assert.equal(sniff(bytes([0x89], 'PNG\r\n')), 'image/png')
  assert.equal(sniff(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')), 'image/webp')
  assert.equal(sniff(bytes('%PDF-1.7\n')), 'application/pdf')
  assert.equal(sniff(bytes([0, 0, 0, 24], 'ftypheic')), 'image/heic')
  assert.equal(sniff(bytes([0, 0, 0, 24], 'ftypmif1')), 'image/heif')
  assert.equal(sniff(bytes([0, 0, 0, 24], 'ftypmp42')), '', 'a video is not a receipt')
  assert.equal(sniff(bytes('<html><script>')), '')
  assert.equal(sniff(bytes('GIF89a')), '')
})

test('checkReceipt: a photo or a PDF, at most RECEIPT_MAX_BYTES, its name tidied', () => {
  assert.deepEqual(checkReceipt('Lunch.jpg', bytes([0xFF, 0xD8, 0xFF])), { ok: { name: 'Lunch.jpg', type: 'image/jpeg' } })
  assert.deepEqual(checkReceipt('', bytes('%PDF-1.4')), { ok: { name: 'Receipt.pdf', type: 'application/pdf' } })
  assert.match(checkReceipt('x.jpg', bytes('<script>')).problem, /photo/)
  assert.match(checkReceipt('x.jpg', new Uint8Array()).problem, /empty/)
  const big = new Uint8Array(RECEIPT_MAX_BYTES + 1)
  big.set([0xFF, 0xD8, 0xFF])
  assert.match(checkReceipt('x.jpg', big).problem, /at most 10 MB/)
  assert.equal(receiptName('a/b\\c"d\u0007e', 'image/png'), 'a b c d e')
  assert.equal(receiptName(42, 'image/png'), 'Receipt.png')
})

test('receiptFileName: its day, a safe name, its id', () => {
  assert.equal(receiptFileName('2026-11-03', 'abc', 'Best Buy: TV.jpg', 'image/jpeg'), '2026-11-03 Best Buy TV abc.jpg')
  assert.equal(receiptFileName('2026-11-03 00:00:00.000Z', 'abc', '../../x', 'application/pdf'), '2026-11-03 ....x abc.pdf')
  assert.equal(receiptFileName('2026-11-03', 'abc', '***', 'image/heic'), '2026-11-03 receipt abc.heic')
})

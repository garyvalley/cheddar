import { RECEIPT_MAX_BYTES } from '~~/shared/receipts'

const KEPT = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])

/**
 * A chosen file as a receipt to send: as it is when it's a photo or PDF of
 * at most RECEIPT_MAX_BYTES (receipts are kept at full size), else a photo
 * made into a JPEG small enough. The server reads what it is from the
 * file itself. Answers the file, or a problem in words.
 */
export async function receiptOf(file: File): Promise<Blob | { problem: string }> {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (file.size <= RECEIPT_MAX_BYTES && (KEPT.has(file.type) || pdf || /\.(heic|heif)$/i.test(file.name))) return file
  if (pdf) return { problem: `That PDF is larger than ${RECEIPT_MAX_BYTES / 1024 / 1024} MB. Take a photo of the receipt instead.` }
  if (!file.type.startsWith('image/')) return { problem: 'Choose a photo or a PDF.' }
  let image: ImageBitmap
  try {
    image = await createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  catch {
    return { problem: 'That photo couldn\'t be opened. Try a JPEG or PNG.' }
  }
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return { problem: 'This browser can\'t make photos smaller.' }
  try {
    for (const side of [4000, 3000, 2000]) {
      const scale = Math.min(1, side / Math.max(image.width, image.height))
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (blob && blob.size <= RECEIPT_MAX_BYTES) return blob
    }
  }
  finally {
    image.close()
  }
  return { problem: 'That photo is too large to keep. Try a closer photo of the receipt.' }
}

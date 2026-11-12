// Statements can be imported from the PDF a bank sends each month, as well
// as CSV and OFX: an import's format may now be "pdf". Only the format
// field's list of values changes; every import already made stays as it was.

const FORMATS = ['csv', 'ofx', 'pdf']

export default async function up(pb) {
  const imports = await pb.collection('imports')
  const format = imports.fields.find(f => f.name === 'format')
  if (!format || FORMATS.every(v => format.values.includes(v))) return
  format.values = FORMATS
  await pb.send('PATCH', '/api/collections/imports', { fields: imports.fields })
}

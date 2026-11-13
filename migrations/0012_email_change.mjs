// The email that confirms a new address (Settings → Account → Change email,
// pb_hooks/credentials.pb.js) gets Cheddar's own words and look, and a link
// to Cheddar's page for it, /confirm-email, in place of PocketBase's default,
// which links to PocketBase's own page the browser can't reach. A second run
// finds the link already there and changes nothing.

const shell = (heading, body) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
  + `<body style="margin:0;padding:0;background:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">`
  + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f9;padding:40px 20px"><tr><td align="center">`
  + `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px"><tr><td style="padding:40px 32px">`
  + `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1b1a20">${heading}</h1>${body}`
  + `</td></tr></table></td></tr></table></body></html>`

const button = (href, label) => `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:12px 28px;`
  + `background:#6b3fc4;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px">${label}</a></p>`

const p = text => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3d3a33">${text}</p>`

export default async function up(pb) {
  const users = await pb.collection('users')
  if (users.confirmEmailChangeTemplate?.body?.includes('/confirm-email?token=')) return
  await pb.send('PATCH', '/api/collections/users', {
    confirmEmailChangeTemplate: {
      subject: 'Confirm your new {APP_NAME} email',
      body: shell('Confirm your new email', p('Tap the button to make this the address you sign in to Cheddar with. The link works for 30 minutes.')
        + button('{APP_URL}/confirm-email?token={TOKEN}', 'Confirm new email')
        + p('If you didn\'t ask for this, you can ignore this email: nothing changes.')),
    },
  })
}

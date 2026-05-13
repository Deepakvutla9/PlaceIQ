const CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID
const REDIRECT_URI = `${window.location.origin}/blank.html`
const SCOPES = 'Mail.Read Mail.Send User.Read offline_access'

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generatePKCE() {
  const verifier = base64urlEncode(crypto.getRandomValues(new Uint8Array(32)))
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64urlEncode(hash)
  return { verifier, challenge }
}

export async function signInMicrosoft() {
  const { verifier, challenge } = await generatePKCE()
  sessionStorage.setItem('ms_pkce_verifier', verifier)

  const authUrl =
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256` +
    `&response_mode=fragment`

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'msauth', 'width=500,height=650,left=200,top=100')
    if (!popup) { reject(new Error('Popup blocked')); return }

    const timer = setInterval(async () => {
      try {
        if (popup.closed) { clearInterval(timer); reject(new Error('Popup closed')); return }
        const hash = popup.location.hash
        const search = popup.location.search
        console.log('[MS Auth] hash:', hash, 'search:', search)

        const params = new URLSearchParams((hash || search).replace(/^[#?]/, ''))
        const code = params.get('code')
        const error = params.get('error')

        if (error) {
          clearInterval(timer); popup.close()
          reject(new Error(params.get('error_description') || error)); return
        }

        if (code) {
          clearInterval(timer)
          popup.close()
          const token = await exchangeCode(code, verifier)
          resolve(token)
        }
      } catch {
        // cross-origin while navigating
      }
    }, 300)

    setTimeout(() => { clearInterval(timer); if (!popup.closed) popup.close(); reject(new Error('timed out')) }, 120000)
  })
}

async function exchangeCode(code, verifier) {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      scope: SCOPES,
    }),
  })
  const data = await res.json()
  console.log('[MS Auth] token response:', data)
  if (data.error) throw new Error(data.error_description || data.error)
  return { accessToken: data.access_token, account: data.id_token || 'outlook_user' }
}

export function getMicrosoftToken() {
  return localStorage.getItem('outlook_token') || null
}

export function getMicrosoftAccount() {
  return localStorage.getItem('outlook_account') || null
}

export function signOutMicrosoft() {
  localStorage.removeItem('outlook_token')
  localStorage.removeItem('outlook_account')
}

export async function fetchOutlookEmails(token) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview,body`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )
  return res.json()
}

export async function sendOutlookEmail(token, to, subject, body) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      }
    }),
  })
  return res.status === 202
}

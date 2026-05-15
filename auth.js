// ─────────────────────────────────────────────────────────────
//  r/CSTeam Clarification Tracker — Google OAuth Doorman
//  Netlify Serverless Function: netlify/functions/auth.js
//
//  Routes:
//    /.netlify/functions/auth/login    → redirects to Google
//    /.netlify/functions/auth/callback → handles Google response
// ─────────────────────────────────────────────────────────────

const ALLOWED_DOMAIN = 'raicom.co';
const ADMIN_EMAILS   = ['julio@raicom.co'];

exports.handler = async function(event) {
  const path = event.path || '';

  // ── /login ────────────────────────────────────────────────
  if (path.endsWith('/login')) {
    const params = new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      redirect_uri:  process.env.REDIRECT_URI,
      response_type: 'code',
      scope:         'openid email profile',
      access_type:   'online',
      prompt:        'select_account',
    });

    return {
      statusCode: 302,
      headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() },
      body: ''
    };
  }

  // ── /callback ─────────────────────────────────────────────
  if (path.endsWith('/callback')) {
    const qs    = event.queryStringParameters || {};
    const code  = qs.code;
    const error = qs.error;

    // User cancelled or Google returned error
    if (error || !code) {
      return htmlPage('Sign-in cancelled', '<p>Sign-in was cancelled or failed. <a href="/">Try again</a>.</p>');
    }

    // Exchange code for tokens
    let tokenData;
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri:  process.env.REDIRECT_URI,
          grant_type:    'authorization_code',
        }).toString()
      });
      tokenData = await tokenRes.json();
    } catch (e) {
      return htmlPage('Error', '<p>Failed to contact Google. Please <a href="/">try again</a>.</p>');
    }

    if (!tokenData.access_token) {
      return htmlPage('Error', '<p>Google did not return a token. Please <a href="/">try again</a>.</p>');
    }

    // Fetch user info
    let userInfo;
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer ' + tokenData.access_token }
      });
      userInfo = await userRes.json();
    } catch (e) {
      return htmlPage('Error', '<p>Could not fetch your profile. Please <a href="/">try again</a>.</p>');
    }

    const email   = (userInfo.email || '').toLowerCase();
    const name    = userInfo.name    || email.split('@')[0];
    const picture = userInfo.picture || '';

    // ── Domain check ──
    if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Access Denied — r/CSTeam</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:#dae0e6;min-height:100vh;display:flex;
    align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:12px;padding:40px 44px;
    max-width:400px;width:100%;text-align:center;
    box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .icon{font-size:48px;margin-bottom:16px}
  h1{font-size:20px;font-weight:700;color:#1c1c1c;margin-bottom:8px}
  p{font-size:14px;color:#576f76;line-height:1.6;margin-bottom:6px}
  .email{font-weight:600;color:#ff4500}
  a{display:inline-block;margin-top:20px;padding:10px 24px;
    background:#ff4500;color:#fff;border-radius:99px;
    text-decoration:none;font-size:14px;font-weight:600}
  a:hover{background:#e03d00}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🚫</div>
    <h1>Access Denied</h1>
    <p>You signed in as <span class="email">${escHtml(email)}</span></p>
    <p>This tool is only available to <strong>@${ALLOWED_DOMAIN}</strong> accounts.</p>
    <p>Please sign in with your Raicom Google account.</p>
    <a href="/.netlify/functions/auth/login">Try a different account</a>
  </div>
</body>
</html>`
      };
    }

    // ── Allowed — build user payload and redirect ──
    const isAdmin = ADMIN_EMAILS.includes(email);
    const user = { email, name, picture, isAdmin };
    const encoded = encodeURIComponent(JSON.stringify(user));

    return {
      statusCode: 302,
      headers: { Location: '/?user=' + encoded },
      body: ''
    };
  }

  // ── Unknown route ─────────────────────────────────────────
  return { statusCode: 404, body: 'Not found' };
};

// ── Helpers ───────────────────────────────────────────────────

function htmlPage(title, body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="font-family:sans-serif;padding:40px;text-align:center">
<h2>${title}</h2>${body}</body></html>`
  };
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

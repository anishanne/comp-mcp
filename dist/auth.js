import crypto from "node:crypto";
// ── Signed token helpers ──
// HMAC-signed tokens are self-validating, so they work across serverless instances.
function signPayload(payload, secret) {
    const data = JSON.stringify(payload);
    const encoded = Buffer.from(data).toString("base64url");
    const sig = crypto
        .createHmac("sha256", secret)
        .update(encoded)
        .digest("base64url");
    return `${encoded}.${sig}`;
}
function verifyPayload(token, secret) {
    const parts = token.split(".");
    if (parts.length !== 2)
        return null;
    const [encoded, sig] = parts;
    const expected = crypto
        .createHmac("sha256", secret)
        .update(encoded)
        .digest("base64url");
    if (sig !== expected)
        return null;
    try {
        return JSON.parse(Buffer.from(encoded, "base64url").toString());
    }
    catch {
        return null;
    }
}
// ── Stateless client store ──
// client_id is a signed token containing client metadata.
// client_secret is deterministically derived from client_id.
// No in-memory or external storage needed — works across serverless instances.
function deriveClientSecret(clientId, secret) {
    return crypto
        .createHmac("sha256", secret)
        .update(`client_secret:${clientId}`)
        .digest("hex");
}
export const READ_ONLY_SCOPE = "readonly";
export class SimpleOAuthProvider {
    secret;
    readOnlySecret;
    constructor(secret, readOnlySecret) {
        this.secret = secret;
        this.readOnlySecret = readOnlySecret && readOnlySecret !== secret ? readOnlySecret : undefined;
    }
    /**
     * Classify a raw token submitted on the authorize page.
     * Returns "full" for the primary token, "readonly" for the read-only token,
     * or null if the token does not match either.
     */
    classifyToken(token) {
        if (token === this.secret)
            return "full";
        if (this.readOnlySecret && token === this.readOnlySecret)
            return "readonly";
        return null;
    }
    get clientsStore() {
        const secret = this.secret;
        return {
            getClient(clientId) {
                console.log("[getClient] clientId length:", clientId?.length, "first 20 chars:", clientId?.slice(0, 20));
                const payload = verifyPayload(clientId, secret);
                if (!payload) {
                    console.log("[getClient] FAILED: signature verification failed");
                    return undefined;
                }
                console.log("[getClient] OK: verified, redirect_uris:", payload.redirect_uris);
                return {
                    ...payload,
                    client_id: clientId,
                    client_secret: deriveClientSecret(clientId, secret),
                };
            },
            registerClient(client) {
                console.log("[registerClient] redirect_uris:", client.redirect_uris);
                const issuedAt = Math.floor(Date.now() / 1000);
                const clientId = signPayload({ ...client, client_id_issued_at: issuedAt }, secret);
                const clientSecret = deriveClientSecret(clientId, secret);
                console.log("[registerClient] OK: clientId length:", clientId.length);
                return {
                    ...client,
                    client_id: clientId,
                    client_secret: clientSecret,
                    client_id_issued_at: issuedAt,
                };
            },
        };
    }
    async authorize(client, params, res) {
        const formData = JSON.stringify({
            clientId: client.client_id,
            redirectUri: params.redirectUri,
            codeChallenge: params.codeChallenge,
            state: params.state,
        });
        res.setHeader("Content-Type", "text/html");
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>COMP MCP — Authorize</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px;
            padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: #888; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; margin-bottom: 0.5rem; }
    input[type="password"] { width: 100%; padding: 0.625rem; background: #0a0a0a;
           border: 1px solid #333; border-radius: 6px; color: #e5e5e5; font-size: 1rem; }
    input[type="password"]:focus { outline: none; border-color: #666; }
    button { width: 100%; padding: 0.625rem; background: #fff; color: #0a0a0a;
             border: none; border-radius: 6px; font-size: 1rem; font-weight: 600;
             cursor: pointer; margin-top: 1rem; }
    button:hover { background: #ddd; }
    button.secondary { background: #262626; color: #e5e5e5; border: 1px solid #444; }
    button.secondary:hover { background: #333; }
    .error { color: #f87171; font-size: 0.875rem; margin-top: 0.75rem; display: none; }
    .notice { display: none; margin-top: 1rem; padding: 0.875rem 1rem; border-radius: 8px;
              background: #422006; border: 1px solid #b45309; color: #fbbf24; font-size: 0.875rem; line-height: 1.4; }
    .notice strong { color: #fde68a; display: block; margin-bottom: 0.25rem; }
    .actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    .actions button { margin-top: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>COMP MCP</h1>
    <p id="intro">Enter the server access token to authorize this connection.</p>
    <form id="form">
      <label for="token">Access Token</label>
      <input type="password" id="token" name="token" required autofocus>
      <button type="submit" id="submit">Authorize</button>
      <div class="error" id="error">Invalid token. Please try again.</div>
    </form>
    <div class="notice" id="readonly-notice">
      <strong>Read-only access</strong>
      You entered the read-only token. This connection can view data (answers, scores, submissions, rosters, analytics) but cannot create, edit, delete, transfer, or refund anything in the database.
      <div class="actions">
        <button type="button" id="continue">Continue</button>
        <button type="button" class="secondary" id="cancel">Cancel</button>
      </div>
    </div>
  </div>
  <script>
    const formData = ${formData};
    let pendingRedirect = null;

    const form = document.getElementById('form');
    const submitBtn = document.getElementById('submit');
    const errorEl = document.getElementById('error');
    const notice = document.getElementById('readonly-notice');
    const tokenInput = document.getElementById('token');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      submitBtn.disabled = true;
      const token = tokenInput.value;
      try {
        const res = await fetch('/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, token }),
        });
        const data = await res.json();
        if (data.redirectUrl) {
          if (data.readOnly) {
            pendingRedirect = data.redirectUrl;
            form.style.display = 'none';
            document.getElementById('intro').style.display = 'none';
            notice.style.display = 'block';
          } else {
            window.location.href = data.redirectUrl;
          }
        } else {
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
        }
      } catch {
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
      }
    });

    document.getElementById('continue').addEventListener('click', () => {
      if (pendingRedirect) window.location.href = pendingRedirect;
    });
    document.getElementById('cancel').addEventListener('click', () => {
      pendingRedirect = null;
      notice.style.display = 'none';
      document.getElementById('intro').style.display = '';
      form.style.display = '';
      submitBtn.disabled = false;
      tokenInput.value = '';
      tokenInput.focus();
    });
  </script>
</body>
</html>`);
    }
    async challengeForAuthorizationCode(_client, authorizationCode) {
        console.log("[challengeForAuthCode] code length:", authorizationCode?.length);
        const payload = verifyPayload(authorizationCode, this.secret);
        if (!payload) {
            console.log("[challengeForAuthCode] FAILED: invalid signature");
            throw new Error("Invalid authorization code");
        }
        if (payload.expiresAt < Date.now()) {
            console.log("[challengeForAuthCode] FAILED: expired", { expiresAt: payload.expiresAt, now: Date.now() });
            throw new Error("Code expired");
        }
        console.log("[challengeForAuthCode] OK");
        return payload.codeChallenge;
    }
    async exchangeAuthorizationCode(client, authorizationCode) {
        console.log("[exchangeAuthCode] code length:", authorizationCode?.length, "clientId length:", client.client_id?.length);
        const payload = verifyPayload(authorizationCode, this.secret);
        if (!payload) {
            console.log("[exchangeAuthCode] FAILED: invalid signature");
            throw new Error("Invalid authorization code");
        }
        if (payload.expiresAt < Date.now()) {
            console.log("[exchangeAuthCode] FAILED: expired");
            throw new Error("Code expired");
        }
        if (payload.clientId !== client.client_id) {
            console.log("[exchangeAuthCode] FAILED: client mismatch, payload.clientId length:", payload.clientId?.length, "vs client.client_id length:", client.client_id?.length);
            throw new Error("Client mismatch");
        }
        const readonly = !!payload.readonly;
        const accessToken = signPayload({
            clientId: client.client_id,
            readonly,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        }, this.secret);
        const refreshToken = signPayload({ clientId: client.client_id, readonly, type: "refresh" }, this.secret);
        return {
            access_token: accessToken,
            token_type: "bearer",
            expires_in: 7 * 24 * 60 * 60,
            refresh_token: refreshToken,
        };
    }
    async exchangeRefreshToken(client, refreshToken) {
        const payload = verifyPayload(refreshToken, this.secret);
        if (!payload || payload.clientId !== client.client_id)
            throw new Error("Invalid refresh token");
        const accessToken = signPayload({
            clientId: client.client_id,
            readonly: !!payload.readonly,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        }, this.secret);
        return {
            access_token: accessToken,
            token_type: "bearer",
            expires_in: 7 * 24 * 60 * 60,
        };
    }
    async verifyAccessToken(token) {
        console.log("[verifyAccessToken] token length:", token?.length, "first 20:", token?.slice(0, 20));
        // Allow raw auth tokens as bearer tokens (for local dev / non-OAuth clients)
        const directMatch = this.classifyToken(token);
        if (directMatch) {
            console.log(`[verifyAccessToken] OK: direct token match (${directMatch})`);
            return {
                token,
                clientId: `direct-${directMatch}`,
                scopes: directMatch === "readonly" ? [READ_ONLY_SCOPE] : [],
                expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
            };
        }
        const payload = verifyPayload(token, this.secret);
        if (!payload) {
            console.log("[verifyAccessToken] FAILED: invalid signature");
            throw new Error("Invalid access token");
        }
        if (payload.expiresAt && payload.expiresAt < Date.now()) {
            console.log("[verifyAccessToken] FAILED: expired");
            throw new Error("Token expired");
        }
        // Middleware expects expiresAt in seconds (Unix epoch), our tokens store ms
        const expiresAtSec = payload.expiresAt
            ? Math.floor(payload.expiresAt / 1000)
            : Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
        const scopes = payload.readonly ? [READ_ONLY_SCOPE] : [];
        console.log("[verifyAccessToken] OK: signed token valid, expiresAt (sec):", expiresAtSec, "readonly:", !!payload.readonly);
        return {
            token,
            clientId: payload.clientId,
            scopes,
            expiresAt: expiresAtSec,
        };
    }
    async revokeToken(_client, _request) {
        // Signed tokens can't be revoked without a blocklist.
        // For this use case, this is acceptable.
    }
    /**
     * Generate a signed authorization code. Called from the /approve endpoint.
     * `readOnly` tags the code so the resulting access token is limited to read scopes.
     */
    generateAuthorizationCode(clientId, codeChallenge, redirectUri, readOnly = false) {
        return signPayload({
            clientId,
            codeChallenge,
            redirectUri,
            readonly: readOnly,
            expiresAt: Date.now() + 60_000, // 60 seconds
        }, this.secret);
    }
}
//# sourceMappingURL=auth.js.map
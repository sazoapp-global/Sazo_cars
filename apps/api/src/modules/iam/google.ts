// Google sign-in (D-100): OpenID Connect authorisation code flow with PKCE. The website keeps the state and
// code verifier in a short-lived cookie; this API swaps the code for Google's ID token and checks it.
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppConfig } from '../../config.js';

export interface GoogleProfile { subject: string; email: string | null; emailVerified: boolean; givenName: string | null; familyName: string | null }

const b64url = (b: Buffer) => b.toString('base64url');

export class GoogleSignIn {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  constructor(private readonly cfg: AppConfig) {}

  get enabled(): boolean {
    return !!(this.cfg.GOOGLE_CLIENT_ID && this.cfg.GOOGLE_CLIENT_SECRET);
  }

  /** The Google page to send the person to, plus the secrets the website must keep until Google sends them back. */
  start(redirectUri: string): { url: string; state: string; codeVerifier: string; nonce: string } {
    const state = b64url(randomBytes(24));
    const nonce = b64url(randomBytes(24));
    const codeVerifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(codeVerifier).digest());
    const url = new URL(this.cfg.GOOGLE_AUTH_URL);
    for (const [k, v] of Object.entries({
      client_id: this.cfg.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
      state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
    })) url.searchParams.set(k, v);
    return { url: url.toString(), state, codeVerifier, nonce };
  }

  /** Swap the code for an ID token and check its signature, issuer, audience, expiry and nonce. */
  async finish(code: string, redirectUri: string, codeVerifier: string, nonce: string): Promise<GoogleProfile> {
    const res = await fetch(this.cfg.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        code, client_id: this.cfg.GOOGLE_CLIENT_ID!, client_secret: this.cfg.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri,
        grant_type: 'authorization_code', code_verifier: codeVerifier,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id_token?: string };
    if (!res.ok || !json.id_token) throw new Error(`Google refused the code (HTTP ${res.status})`);
    this.jwks ??= createRemoteJWKSet(new URL(this.cfg.GOOGLE_JWKS_URL));
    const issuers = [this.cfg.GOOGLE_ISSUER, this.cfg.GOOGLE_ISSUER.replace(/^https:\/\//, '')];
    const { payload } = await jwtVerify(json.id_token, this.jwks, { issuer: issuers, audience: this.cfg.GOOGLE_CLIENT_ID! });
    if (payload.nonce !== nonce) throw new Error('Google sign-in did not match this browser (nonce)');
    return {
      subject: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      givenName: typeof payload.given_name === 'string' ? payload.given_name : null,
      familyName: typeof payload.family_name === 'string' ? payload.family_name : null,
    };
  }
}

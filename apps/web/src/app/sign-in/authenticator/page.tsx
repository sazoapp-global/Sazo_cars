import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { authenticatorKey, pendingSetup } from '@/lib/session';
import { startAuthenticator } from '../actions';
import { AuthenticatorForm } from './form';

export const metadata: Metadata = { title: 'Set up your authenticator app', robots: { index: false } };

/** The key in groups of four, easier to type into the app by hand. */
const grouped = (s: string) => s.match(/.{1,4}/g)!.join(' ');

/** SAZO staff set up an authenticator app before going in; it replaces SMS codes for them (D-145). */
export default async function Authenticator() {
  if (!(await pendingSetup('setup_authenticator'))) redirect('/sign-in');
  const key = await authenticatorKey();
  const qr = key ? await QRCode.toString(key.otpauthUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#002177', light: '#ffffff' } }) : '';
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Set up your authenticator app</h1>
        <p className="mt-1 text-muted">SAZO staff confirm it&apos;s them with an authenticator app instead of SMS codes. You do this once.</p>
        {!key ? (
          <>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
              <li>Install an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator.</li>
              <li>Press the button below to show your QR code.</li>
            </ol>
            <form action={startAuthenticator} className="mt-5">
              <button type="submit" className="btn btn-primary w-full">Show my QR code</button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm">In the app, add an account and scan this code.</p>
            <div className="mx-auto mt-3 w-48 rounded-lg border border-line bg-white p-2" role="img" aria-label="QR code for your authenticator app"
              dangerouslySetInnerHTML={{ __html: qr }} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-primary-container">Can&apos;t scan? Type this key instead</summary>
              <p className="mt-2 break-all rounded-md bg-soft p-2 text-center font-mono tracking-wider" data-testid="totp-key">{grouped(key.secret)}</p>
              <p className="mt-1 text-muted">Choose &ldquo;time based&rdquo; if the app asks.</p>
            </details>
            <AuthenticatorForm />
          </>
        )}
      </div>
    </div>
  );
}

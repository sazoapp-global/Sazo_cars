import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/api';
import { RegisterForm } from './form';

export const metadata: Metadata = { title: 'Register your business' };

export default async function Register() {
  if (!(await isSignedIn())) redirect('/sign-in?next=/business/register');
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Register your business</h1>
      <p className="mt-1 text-muted">SAZO checks every business before it can add to vehicle histories (D-055). It usually takes a few working days.</p>
      <RegisterForm />
    </div>
  );
}

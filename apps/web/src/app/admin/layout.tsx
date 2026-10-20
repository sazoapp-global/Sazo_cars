import type { Metadata } from 'next';
import { AdminNav } from './admin-nav';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · SAZO admin' }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 md:flex-row md:px-8">
      <AdminNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

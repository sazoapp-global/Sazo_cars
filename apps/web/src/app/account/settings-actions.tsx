'use server';
// Settings inside any page: the panel asks for this and shows what comes back, so no new page opens.
import { AccountSettings } from './settings-view';

const SAFE_PATH = /^\/(?![/\\])[^\s]*$/;

export async function loadSettings(q: { back: string; done?: string; error?: string; newPhone?: string }) {
  const back = SAFE_PATH.test(q.back) ? q.back : '/account';
  return <AccountSettings sp={{ done: q.done, error: q.error, newPhone: q.newPhone }} back={back} inPanel />;
}

'use server';
// Settings inside any page: the panel asks for this and shows what comes back, so no new page opens.
import { YourDataView } from './data/your-data-view';
import { AccountSettings } from './settings-view';

const SAFE_PATH = /^\/(?![/\\])[^\s]*$/;

export async function loadSettings(q: { back: string; done?: string; error?: string; newPhone?: string; section?: string }) {
  const back = SAFE_PATH.test(q.back) ? q.back : '/account';
  return <AccountSettings sp={{ done: q.done, error: q.error, newPhone: q.newPhone, section: q.section }} back={back} inPanel />;
}

/** Your data in the same place as Settings (D-157): details and businesses, with the PDF and Excel downloads. */
export async function loadYourData() {
  return <YourDataView />;
}

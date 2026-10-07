import { useRegisterSW } from 'virtual:pwa-register/react';

/** A new version is ready: offer to reload. Never interrupts a mechanic mid-job. */
export function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 bg-soft px-4 py-2 text-sm">
      <span>A new version of the app is ready.</span>
      <button type="button" className="font-semibold text-primary-container underline" onClick={() => void updateServiceWorker(true)}>Update</button>
    </div>
  );
}

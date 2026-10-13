import type { JobsState } from '../lib/use-jobs';
import { AlertsPanel } from './home';

/** Everything that needs the garage's attention: disputes, jobs not accepted, jobs not sent; then good news. */
export function Alerts({ jobs }: { jobs: JobsState }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <AlertsPanel alerts={jobs.alerts} />
    </div>
  );
}

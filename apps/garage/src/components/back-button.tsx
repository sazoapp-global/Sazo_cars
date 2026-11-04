// The one way back (D-158, 4 Nov 2026), as on the website: a white rounded "Back" button with a left arrow, top
// left above the title.
import { Icon } from './icon';

export function BackButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line bg-card px-4 py-2 font-semibold text-primary-container shadow-sm print:hidden ${className}`}>
      <Icon name="arrow_back" size={20} />Back
    </button>
  );
}

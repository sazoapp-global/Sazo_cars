import { ICONS, type IconName } from './icon-paths';

/** Material Symbols as inline SVG. Decorative by default; pass `label` when the icon carries meaning alone. */
export function Icon({ name, size = 20, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const icon = ICONS[name];
  return (
    <svg viewBox={icon.vb} width={size} height={size} className={className} fill="currentColor"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: false })}>
      <path d={icon.d} />
    </svg>
  );
}
export type { IconName };

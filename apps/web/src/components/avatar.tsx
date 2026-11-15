// A round picture of a person or a business (D-186): their photo or logo when they have one, otherwise their
// initials. Logos sit on white with a thin ring, so dark logos stay readable on navy.
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** The address of a logo or photo; the id changes whenever the picture does. */
export const pictureUrl = (id: string) => `/pictures/${id}`;

export function Avatar({ name, pictureId, size = 44, tone = 'navy', logo = false, className = '' }: {
  name: string; pictureId?: string | null; size?: number; tone?: 'navy' | 'lime' | 'white'; logo?: boolean; className?: string;
}) {
  if (pictureId) {
    return (
      <img src={pictureUrl(pictureId)} alt="" aria-hidden width={size} height={size} style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${logo ? 'bg-white ring-1 ring-line' : 'bg-soft'} ${className}`} />
    );
  }
  const colours = { navy: 'bg-primary-container text-white', lime: 'bg-lime text-ink', white: 'bg-white text-primary-container' }[tone];
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size >= 40 ? Math.round(size * 0.34) : 12 }}
      className={`grid shrink-0 place-items-center rounded-full font-extrabold ${colours} ${className}`}>
      {initialsOf(name)}
    </span>
  );
}

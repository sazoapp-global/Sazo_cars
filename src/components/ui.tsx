import type { ReactNode } from "react";
import type { RecordStatus, StockStatus } from "../data/mock";
import { useStore } from "../store";

export function BrandMark({ size = 14 }: { size?: number }) {
  return (
    <span
      className="brand-mark"
      style={size !== 14 ? { width: size, height: size, boxShadow: `${size * 0.36}px ${size * 0.36}px 0 var(--blue-light)` } : undefined}
      aria-hidden
    />
  );
}

type BadgeTone = "verified" | "checking" | "warn" | "danger" | "outline";
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const recordStatus: Record<RecordStatus, [BadgeTone, string]> = {
  verified: ["verified", "✓ Verified"],
  checking: ["checking", "◆ Checking"],
  "needs-invoice": ["warn", "! Needs invoice"],
  draft: ["outline", "Draft"],
  disputed: ["danger", "! Disputed"],
  queued: ["outline", "Queued"],
};
export function RecordBadge({ status }: { status: RecordStatus }) {
  const [tone, label] = recordStatus[status];
  return <Badge tone={tone}>{label}</Badge>;
}
export const recordStatusLabel = (s: RecordStatus) => recordStatus[s][1].replace(/^[✓◆!]\s*/, "");

const stockStatus: Record<StockStatus, [BadgeTone, string]> = {
  "on-hold": ["outline", "On hold"],
  intake: ["outline", "Intake"],
  listed: ["verified", "Listed"],
  reserved: ["checking", "Reserved"],
  sold: ["outline", "Sold"],
};
export function StockBadge({ status }: { status: StockStatus }) {
  const [tone, label] = stockStatus[status];
  return (
    <span className={`badge badge-${tone}${tone === "outline" ? " plain" : ""}`}>{label}</span>
  );
}

export interface StatItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  valueClass?: string;
}
export function StatStrip({ items, variant, min }: { items: StatItem[]; variant?: "compact" | "tight"; min?: number }) {
  return (
    <div className={`stats${variant ? ` ${variant}` : ""}`} style={min ? ({ "--stat-min": `${min}px` } as React.CSSProperties) : undefined}>
      {items.map((s) => (
        <div className="stat" key={s.label}>
          <p className="eyebrow">{s.label}</p>
          <p className={`stat-value${s.valueClass ? ` ${s.valueClass}` : ""}`}>{s.value}</p>
          {s.note}
        </div>
      ))}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          <button onClick={() => dismissToast(t.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}

export function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <button onClick={onClick}>
        {label}
        {active && dir === "asc" ? " ▴" : " ▾"}
      </button>
    </th>
  );
}

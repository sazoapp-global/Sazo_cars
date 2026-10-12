import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { garageRecords, team as seedTeam, type JobRecord, type TeamMember } from "./data/mock";

interface Toast {
  id: number;
  text: string;
}

interface Store {
  records: JobRecord[];
  addRecord: (r: Omit<JobRecord, "id">) => JobRecord;
  team: TeamMember[];
  inviteMember: (m: Omit<TeamMember, "id" | "invited" | "lastActive" | "twoFactor">) => void;
  online: boolean;
  toasts: Toast[];
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<JobRecord[]>(garageRecords);
  const [team, setTeam] = useState<TeamMember[]>(seedTeam);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);
  const nextJob = useRef(1285);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string) => {
      const id = nextToast.current++;
      setToasts((t) => [...t, { id, text }]);
      window.setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast],
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Records saved while offline upload automatically once we're back online.
  useEffect(() => {
    if (!online) return;
    setRecords((rs) => {
      const queued = rs.filter((r) => r.status === "queued").length;
      if (!queued) return rs;
      toast(`${queued} queued record${queued > 1 ? "s" : ""} uploaded`);
      return rs.map((r) => (r.status === "queued" ? { ...r, status: "checking" } : r));
    });
  }, [online, toast]);

  const addRecord = useCallback((r: Omit<JobRecord, "id">) => {
    const rec = { ...r, id: `J-${nextJob.current++}` };
    setRecords((rs) => [rec, ...rs]);
    return rec;
  }, []);

  const inviteMember = useCallback((m: Omit<TeamMember, "id" | "invited" | "lastActive" | "twoFactor">) => {
    setTeam((t) => [...t, { ...m, id: `t${Date.now()}`, invited: true, lastActive: "", twoFactor: "—" }]);
  }, []);

  const value = useMemo(
    () => ({ records, addRecord, team, inviteMember, online, toasts, toast, dismissToast }),
    [records, addRecord, team, inviteMember, online, toasts, toast, dismissToast],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export const MOBILE_QUERY = "(max-width: 720px)";

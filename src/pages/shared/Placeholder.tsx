import { Link, useLocation } from "react-router-dom";

export function Placeholder({ title }: { title: string }) {
  const { pathname } = useLocation();
  const home = "/" + pathname.split("/")[1];
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <div className="note" style={{ maxWidth: "60ch", display: "flex", flexDirection: "column", gap: 8 }}>
        <p>This section isn’t designed yet. It will follow the same layout as the rest of the partner portal.</p>
        <Link to={home}>Back to home</Link>
      </div>
    </div>
  );
}

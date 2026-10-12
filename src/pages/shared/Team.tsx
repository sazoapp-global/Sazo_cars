import { useRef, useState } from "react";
import { rolePermissions, type Role, type TeamMember } from "../../data/mock";
import { useStore } from "../../store";

const ROLES: Role[] = ["Manager", "Contributor", "Contributor (drafts only)", "Viewer"];

function Perm({ v }: { v: boolean | string }) {
  if (v === true) return <td className="tone-green">✓</td>;
  if (v === false) return <td className="muted">—</td>;
  return <td className="muted">{v}</td>;
}

function RoleCell({ role }: { role: Role }) {
  const m = role.match(/^(.*) \((.*)\)$/);
  return m ? (
    <td>
      {m[1]} <span className="small muted">({m[2]})</span>
    </td>
  ) : (
    <td>{role}</td>
  );
}

// P6 — shared by all partner types.
export function Team() {
  const { team, inviteMember, toast } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Contributor");

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) return;
    inviteMember({ name: name.trim(), role });
    toast(`Invite sent to ${email}`);
    setName("");
    setEmail("");
    setRole("Contributor");
    dialog.current?.close();
  }

  return (
    <div className="page">
      <section className="card" aria-labelledby="team-h">
        <div className="page-head">
          <h1 className="card-title" id="team-h">
            Team · {team.length} people
          </h1>
          <button className="btn btn-primary" onClick={() => dialog.current?.showModal()}>
            + Invite staff
          </button>
        </div>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Create</th>
                <th>Submit</th>
                <th>Edit others</th>
                <th>Team &amp; billing</th>
                <th>2FA</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {team.map((m: TeamMember) => {
                const p = rolePermissions[m.role];
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>
                      {m.name}
                      {m.invited && (
                        <span className="small tone-amber" style={{ fontWeight: 600 }}>
                          {" "}
                          · invited
                        </span>
                      )}
                    </td>
                    <RoleCell role={m.role} />
                    {m.invited ? (
                      <>
                        <td className="muted">—</td>
                        <td className="muted">—</td>
                        <td className="muted">—</td>
                        <td className="muted">—</td>
                      </>
                    ) : (
                      <>
                        <Perm v={p.create} />
                        <Perm v={p.submit} />
                        <Perm v={p.editOthers} />
                        <Perm v={p.teamBilling} />
                      </>
                    )}
                    <td className={m.twoFactor === "On" ? "tone-green" : "muted"}>{m.twoFactor}</td>
                    <td>
                      {m.invited ? (
                        <button className="link" style={{ fontSize: 14 }} onClick={() => toast(`Invite resent to ${m.name}`)}>
                          Resend
                        </button>
                      ) : (
                        m.lastActive
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <dialog ref={dialog} className="dialog" aria-labelledby="invite-h">
        <form onSubmit={invite}>
          <h2 id="invite-h" className="card-title">
            Invite staff
          </h2>
          <div className="field">
            <label className="label" htmlFor="inv-name">
              Name *
            </label>
            <input id="inv-name" className="input" style={{ minHeight: 48 }} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="inv-email">
              Email *
            </label>
            <input id="inv-email" type="email" className="input" style={{ minHeight: 48 }} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="inv-role">
              Role
            </label>
            <select id="inv-role" className="input" style={{ minHeight: 48 }} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <p className="small muted">Contributors on a shared bay tablet sign in with a personal PIN. Everyone else needs 2FA.</p>
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Send invite
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

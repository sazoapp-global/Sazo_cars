// I-07: a buyer asks an approved inspector or inspection centre to check a car before buying it. The inspector
// accepts with a date and time, or declines with a reason, and marks it done after the visit; the buyer can
// cancel. Each side is told by SMS. The buyer's phone is shown to the inspector only once they accept.
// No money moves through SAZO, and the inspection itself is recorded in the Garage app as usual.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { enforceLimit } from '../../platform/limits.js';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IamService, type Actor } from '../iam/index.js';
import { NotificationsService } from '../notify/index.js';
import { VehicleRegistry } from '../vehicle/index.js';

export const BOOKING_REQUESTS_PER_DAY = 5;
export const INSPECTOR_TYPES = ['inspector', 'inspection_centre'];
const MAX_DAYS_AHEAD = 60;

export class BookingError extends Error {
  constructor(readonly code: 'inspector_not_found' | 'booking_not_found' | 'vehicle_not_found' | 'bad_date' | 'not_allowed_now', message: string) {
    super(message);
  }
}

type Status = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'done';
interface Row {
  id: string; buyer_user_id: string; organisation_id: string; vehicle_id: string | null; plate: string; preferred_date: string; place: string | null;
  note: string | null; status: Status; scheduled_at: Date | null; response_note: string | null; responded_by_user_id: string | null; created_at: Date; updated_at: Date;
}
const COLS = `id, buyer_user_id, organisation_id, vehicle_id, plate, to_char(preferred_date, 'YYYY-MM-DD') AS preferred_date, place, note, status,
  scheduled_at, response_note, responded_by_user_id, created_at, updated_at`;

/** Today's date in Uganda (UTC+3), as YYYY-MM-DD. */
const ugandaToday = (now = new Date()) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "Tue 3 Nov, 10:00" in Uganda time, for SMS. */
export const ugandaWhen = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  .format(d).replace(/,? (\d\d:\d\d)$/, ', $1');

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
  ) {}

  /** Approved inspectors and inspection centres a buyer can ask, by district then name. */
  async inspectors(district?: string) {
    const all = (await Promise.all(INSPECTOR_TYPES.map((type) => this.iam.listOrganisations({ status: 'approved', type })))).flat();
    return all
      .filter((o) => !district || (o.district ?? '').toLowerCase() === district.toLowerCase())
      .map((o) => ({ organisationId: o.id, name: o.tradingName ?? o.legalName, type: o.type, district: o.district }))
      .sort((a, b) => (a.district ?? '~').localeCompare(b.district ?? '~') || a.name.localeCompare(b.name));
  }

  private orgName = async (id: string) => {
    const o = await this.iam.organisation(id);
    return o ? (o.tradingName ?? o.legalName) : 'The inspector';
  };

  private async byId(id: string): Promise<Row | undefined> {
    return (await this.pool.query<Row>(`SELECT ${COLS} FROM inspection.bookings WHERE id = $1`, [id])).rows[0];
  }

  /** A buyer asks for an inspection. */
  async request(actor: Actor, b: { organisationId: string; plate: string; vehicleRef?: string; preferredDate: string; place?: string; note?: string }) {
    const buyerId = actor.userId;
    const org = await this.iam.organisation(b.organisationId);
    if (!org || org.status !== 'approved' || !INSPECTOR_TYPES.includes(org.type)) throw new BookingError('inspector_not_found', 'No such inspector');
    const today = ugandaToday();
    if (b.preferredDate < today || b.preferredDate > addDays(today, MAX_DAYS_AHEAD)) {
      throw new BookingError('bad_date', `Choose a day from today to ${MAX_DAYS_AHEAD} days ahead`);
    }
    let vehicleId: string | null = null;
    if (b.vehicleRef) {
      vehicleId = (await this.registry.idForRef(b.vehicleRef)) ?? null;
      if (!vehicleId) throw new BookingError('vehicle_not_found', 'No such car');
    }
    const plate = b.plate.trim().toUpperCase().replace(/\s+/g, ' ');
    const id = await withTx(this.pool, async (tx) => {
      // Each request sends a text to the inspector, so a buyer can ask only a few times a day (S5).
      await enforceLimit(tx, `booking:${buyerId}`, BOOKING_REQUESTS_PER_DAY,
        `SELECT count(*)::int AS n FROM inspection.bookings WHERE buyer_user_id = $1 AND created_at > now() - interval '1 day'`, [buyerId],
        `You can ask for up to ${BOOKING_REQUESTS_PER_DAY} inspections a day. Try again tomorrow.`);
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO inspection.bookings (buyer_user_id, organisation_id, vehicle_id, plate, preferred_date, place, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [buyerId, b.organisationId, vehicleId, plate, b.preferredDate, b.place?.trim() || null, b.note?.trim() || null]);
      await this.iam.audit({ actor, organisationId: b.organisationId, action: 'booking.requested', targetType: 'booking', targetId: rows[0]!.id }, tx);
      return rows[0]!.id;
    });
    const name = org.tradingName ?? org.legalName;
    for (const m of await this.iam.managerPhones(b.organisationId)) {
      await this.notify.sendSmsToPhone(m.phone, 'booking_requested', { organisation: name, plate, date: b.preferredDate }, 'account', m.userId, { relatedType: 'booking', relatedId: id })
        .catch(() => false); // a failed SMS never undoes the request
    }
    return this.buyerView((await this.byId(id))!);
  }

  async mine(buyerId: string) {
    const { rows } = await this.pool.query<Row>(`SELECT ${COLS} FROM inspection.bookings WHERE buyer_user_id = $1 ORDER BY created_at DESC LIMIT 50`, [buyerId]);
    return Promise.all(rows.map((r) => this.buyerView(r)));
  }

  /** The buyer cancels a request that is still open or accepted. */
  async cancel(buyerId: string, id: string) {
    const row = await this.byId(id);
    if (!row || row.buyer_user_id !== buyerId) throw new BookingError('booking_not_found', 'No such booking');
    const { rowCount } = await this.pool.query(`UPDATE inspection.bookings SET status = 'cancelled' WHERE id = $1 AND status IN ('requested','accepted')`, [id]);
    if (!rowCount) throw new BookingError('not_allowed_now', `This booking is already ${row.status}`);
    if (row.status === 'accepted' && row.responded_by_user_id) {
      const phone = await this.iam.userPhone(row.responded_by_user_id);
      if (phone) await this.notify.sendSmsToPhone(phone, 'booking_cancelled', { plate: row.plate }, 'account', row.responded_by_user_id, { relatedType: 'booking', relatedId: id }).catch(() => false);
    }
    return this.buyerView((await this.byId(id))!);
  }

  /** Requests to one inspector: open and upcoming first. */
  async forOrganisation(organisationId: string, status?: Status) {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLS} FROM inspection.bookings WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY CASE status WHEN 'requested' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, COALESCE(scheduled_at::date, preferred_date), created_at DESC LIMIT 100`,
      [organisationId, status ?? null]);
    const names = await this.iam.firstNames(rows.map((r) => r.buyer_user_id));
    return Promise.all(rows.map(async (r) => ({
      ...this.common(r),
      buyer: {
        givenName: names.get(r.buyer_user_id) ?? 'Buyer',
        // The buyer's phone is shared only once the inspector has accepted.
        phone: r.status === 'accepted' ? ((await this.iam.userPhone(r.buyer_user_id)) ?? null) : null,
      },
    })));
  }

  /** The inspector accepts (with a date and time), declines (with a reason) or marks the visit done. */
  async decide(actor: Actor, organisationId: string, id: string, d: { decision: 'accept' | 'decline' | 'done'; scheduledAt?: string; note?: string }) {
    const row = await this.byId(id);
    if (!row || row.organisation_id !== organisationId) throw new BookingError('booking_not_found', 'No such booking');
    const from: Record<typeof d.decision, Status[]> = { accept: ['requested'], decline: ['requested', 'accepted'], done: ['accepted'] };
    if (!from[d.decision].includes(row.status)) throw new BookingError('not_allowed_now', `This booking is ${row.status}`);
    let scheduledAt: Date | null = row.scheduled_at;
    if (d.decision === 'accept') {
      scheduledAt = new Date(d.scheduledAt!);
      if (scheduledAt.getTime() < Date.now() - 3_600_000 || scheduledAt.getTime() > Date.now() + (MAX_DAYS_AHEAD + 30) * 86_400_000) {
        throw new BookingError('bad_date', 'Choose a date and time in the coming weeks');
      }
    }
    const status: Status = d.decision === 'accept' ? 'accepted' : d.decision === 'decline' ? 'declined' : 'done';
    const { rowCount } = await this.pool.query(
      `UPDATE inspection.bookings SET status = $2, scheduled_at = $3, response_note = COALESCE($4, response_note), responded_by_user_id = $5
        WHERE id = $1 AND status = $6`,
      [id, status, scheduledAt, d.note?.trim() || null, actor.userId, row.status]);
    if (!rowCount) throw new BookingError('not_allowed_now', 'This booking changed. Open it again.');
    await this.iam.audit({ actor, organisationId, action: `booking.${status}`, targetType: 'booking', targetId: id });
    if (d.decision !== 'done') {
      const phone = await this.iam.userPhone(row.buyer_user_id);
      const organisation = await this.orgName(organisationId);
      if (phone) {
        await (d.decision === 'accept'
          ? this.notify.sendSmsToPhone(phone, 'booking_accepted', { organisation, plate: row.plate, when: ugandaWhen(scheduledAt!) }, 'account', row.buyer_user_id, { relatedType: 'booking', relatedId: id })
          : this.notify.sendSmsToPhone(phone, 'booking_declined', { organisation, plate: row.plate, reason: (d.note ?? '').slice(0, 80) }, 'account', row.buyer_user_id, { relatedType: 'booking', relatedId: id }))
          .catch(() => false);
      }
    }
    return (await this.forOrganisation(organisationId)).find((b) => b.bookingId === id)!;
  }

  private common(r: Row) {
    return {
      bookingId: r.id, plate: r.plate, preferredDate: r.preferred_date, place: r.place, note: r.note, status: r.status,
      scheduledAt: r.scheduled_at?.toISOString() ?? null, responseNote: r.response_note, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
    };
  }

  private async buyerView(r: Row) {
    const vehicleRef = r.vehicle_id ? ((await this.registry.card(r.vehicle_id))?.vehicleRef ?? null) : null;
    return {
      ...this.common(r), vehicleRef,
      inspector: {
        organisationId: r.organisation_id, name: await this.orgName(r.organisation_id),
        // The inspector's phone is shared with the buyer once they accept.
        phone: r.status === 'accepted' && r.responded_by_user_id ? ((await this.iam.userPhone(r.responded_by_user_id)) ?? null) : null,
      },
    };
  }
}

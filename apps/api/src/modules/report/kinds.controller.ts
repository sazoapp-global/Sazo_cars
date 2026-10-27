// The kind of car (D-148): what SAZO can tell from a chassis code or model (for the dealer's form), and the SAZO
// admins' list of cars it could not tell or whose records disagree, where an admin sets the kind with a reason.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { VEHICLE_KINDS, tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, IamService, RequirePermission, type Actor } from '../iam/index.js';
import { ReferenceService } from '../ref/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { CarDetailsService } from './car-details.service.js';

const REF = z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
const text = z.string().trim().max(60).optional();

@Controller()
export class KindsController {
  constructor(
    @Inject(ReferenceService) private readonly reference: ReferenceService,
    @Inject(CarDetailsService) private readonly details: CarDetailsService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /**
   * GET /v1/reference/identify?make=&model=&chassis= — the kind of car from the chassis code, else the model, and the
   * maker's figures for the model (test data until real maker specifications are loaded). For filling forms in.
   */
  @Get('reference/identify')
  identify(@Query() q: Record<string, string>) {
    const p = z.object({ make: text, model: text, chassis: z.string().trim().max(30).optional() }).safeParse(q);
    if (!p.success) throw badRequest('invalid_query', 'make, model and chassis are short text');
    const r = this.reference.identify(p.data);
    const s = r.spec;
    return {
      ...(r.kind ? { kind: r.kind, via: r.via, ...('code' in r && r.code ? { code: r.code } : {}) } : { reason: r.reason, ...(r.kinds ? { kinds: r.kinds } : {}) }),
      ...(s ? { spec: { make: s.make, model: s.model, engineCc: s.engineCc, seats: s.seats, doors: s.doors, cylinders: s.cylinders, powerHp: s.powerHp,
        fuelKmPerL: s.fuelKmPerL, loadTonnes: s.loadTonnes, gvwTonnes: s.gvwTonnes, axles: s.axles, drive: s.drive, basis: s.basis } } : {}),
    };
  }

  /** GET /v1/admin/vehicle-kinds — cars with no kind SAZO could tell, and cars whose records disagree (SAZO admins). */
  @Get('admin/vehicle-kinds')
  @RequirePermission('vehicle.kind.decide')
  queue() {
    return this.details.queue();
  }

  /** POST /v1/admin/vehicles/:ref/kind { kind, reason } — a SAZO admin sets the kind; recorded, never edited. */
  @Post('admin/vehicles/:ref/kind')
  @HttpCode(201)
  @RequirePermission('vehicle.kind.decide')
  async decide(@CurrentActor() actor: Actor, @Param('ref') ref: string, @Body() body: unknown) {
    if (!REF.safeParse(ref).success) throw notFound('vehicle_not_found', 'No such vehicle');
    const b = z.object({ kind: z.enum(VEHICLE_KINDS), reason: z.string().trim().min(3).max(300).transform(tidySentence) }).strict().safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Choose the kind and give a short reason', b.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const id = await this.registry.idForRef(ref);
    if (!id) throw notFound('vehicle_not_found', 'No such vehicle');
    await this.registry.decideKind(id, b.data.kind, b.data.reason, actor.userId);
    await this.iam.audit({ actor, action: 'vehicle.kind_decided', targetType: 'vehicle', targetId: id, details: b.data });
    return this.details.forVehicle(id);
  }
}

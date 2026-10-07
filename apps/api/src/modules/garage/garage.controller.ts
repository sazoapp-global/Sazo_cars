// Garage workspace API (API Outline §5.5). Every call acts for one garage: X-Organisation-Id header.
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { canForOrg, CurrentActor, IamService, type Actor } from '../iam/index.js';
import { GarageError, GarageService } from './garage.service.js';
import { DraftInput } from './job-form.js';

const Uuid = z.string().uuid();
const Submit = z.object({
  acknowledgedWarnings: z.array(z.object({ code: z.string(), explanation: z.string().trim().min(3).max(500) })).max(10).default([]),
});
const Staff = z.object({
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum(['org_staff', 'org_manager']),
});

export function garageProblem(err: unknown): never {
  if (err instanceof GarageError) {
    const status = ({
      job_not_found: 404, vehicle_not_found: 404, version_conflict: 409, job_not_editable: 409, job_already_submitted: 409,
      job_incomplete: 400, invalid_plate: 400, evidence_invalid: 422, plate_photo_required: 422, warnings_need_acknowledgement: 422,
      blocked: 422, organisation_not_approved: 403,
    } as const)[err.code];
    throw new Problem(status, err.code, status === 404 ? 'Not found' : status === 409 ? 'Conflict' : status === 403 ? 'Forbidden' : status === 400 ? 'Invalid request' : 'Unprocessable', err.message, err.details);
  }
  throw err;
}

@Controller('garage')
export class GarageController {
  constructor(
    @Inject(GarageService) private readonly garage: GarageService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /** The caller must act for an APPROVED garage with this permission (D-055, D-056). */
  private async org(actor: Actor, orgId: string | undefined, permission: string): Promise<string> {
    if (!orgId || !Uuid.safeParse(orgId).success) throw badRequest('organisation_required', 'Send the X-Organisation-Id header');
    const access = canForOrg(actor, orgId, permission);
    if (!access.ok) {
      if (access.code === 'organisation_not_approved') throw new Problem(403, 'organisation_not_approved', 'Forbidden', 'Your garage has not been approved yet');
      throw new Problem(403, 'forbidden', 'Forbidden', 'You cannot do this for this organisation');
    }
    const type = access.membership?.organisationType ?? (await this.iam.organisation(orgId))?.type;
    if (type !== 'garage') throw new Problem(403, 'not_a_garage', 'Forbidden', 'This organisation is not a garage');
    return orgId;
  }

  /** GET /v1/garage/vehicles/lookup?plate= — find the car in the bay (D-053). */
  @Get('vehicles/lookup')
  async lookup(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('plate') plate?: string) {
    await this.org(actor, orgId, 'garage.job.create');
    if (!plate || plate.trim().length < 4 || plate.length > 12) throw badRequest('invalid_query', 'plate must be 4–12 characters');
    return this.garage.lookup(plate).catch(garageProblem);
  }

  /** GET /v1/garage/jobs?status= */
  @Get('jobs')
  async list(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('status') status?: string, @Query('limit') limit?: string) {
    const org = await this.org(actor, orgId, 'garage.job.create');
    const s = status === undefined ? undefined : z.enum(['draft', 'submitted', 'accepted', 'rejected']).safeParse(status);
    if (s && !s.success) throw badRequest('invalid_query', 'Unknown status');
    const jobs = await this.garage.list(org, s?.data, Math.min(Math.max(Number(limit) || 25, 1), 100));
    return { items: await Promise.all(jobs.map((j) => this.garage.view(j))), nextCursor: null };
  }

  /** PUT /v1/garage/jobs/:jobId — create or update a draft (offline-safe upsert). */
  @Put('jobs/:jobId')
  async save(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('jobId') jobId: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'garage.job.create');
    if (!Uuid.safeParse(jobId).success) throw badRequest('invalid_job_id', 'jobId must be a UUID generated on the device');
    const d = DraftInput.safeParse(body);
    if (!d.success) throw badRequest('invalid_request', 'Check the fields', d.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
    const job = await this.garage.saveDraft(actor, org, jobId, d.data).catch(garageProblem);
    return this.garage.view(job);
  }

  /** GET /v1/garage/jobs/:jobId */
  @Get('jobs/:jobId')
  async get(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('jobId') jobId: string) {
    const org = await this.org(actor, orgId, 'garage.job.create');
    if (!Uuid.safeParse(jobId).success) throw notFound('job_not_found', 'No such job');
    return this.garage.view(await this.garage.job(org, jobId).catch(garageProblem));
  }

  /** POST /v1/garage/jobs/:jobId/submit — becomes an Ingestion submission (DM-4); the owner SMS follows. */
  @Post('jobs/:jobId/submit')
  @HttpCode(202)
  async submit(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Headers('idempotency-key') key: string | undefined,
    @Param('jobId') jobId: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'garage.job.submit');
    if (!key || !Uuid.safeParse(key).success) throw badRequest('idempotency_key_required', 'Send an Idempotency-Key header (UUID)');
    if (!Uuid.safeParse(jobId).success) throw notFound('job_not_found', 'No such job');
    const b = Submit.safeParse(body ?? {});
    if (!b.success) throw badRequest('invalid_request', 'acknowledgedWarnings need a code and an explanation');
    return this.garage.submit(actor, org, jobId, key, b.data.acknowledgedWarnings).catch(garageProblem);
  }

  /** GET /v1/garage/staff */
  @Get('staff')
  async staff(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined) {
    const org = await this.org(actor, orgId, 'garage.staff.manage');
    return this.iam.listMembers(org);
  }

  /** POST /v1/garage/staff — managers add a mechanic or receptionist (D-056). */
  @Post('staff')
  async addStaff(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'garage.staff.manage');
    const b = Staff.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'phone, displayName and role are required');
    return this.iam.addStaff(actor, org, b.data);
  }
}

// A-05 Identity check for business managers (Accounts plan 1.5, D-104). A manager sends their National ID
// number and a photo of their ID from the business page; SAZO admins see it on the business they are approving
// (approving the business approves it) and, for a manager added later, in the identity queue.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, IamService, IdentityError, IdentityService, RequirePermission, type Actor } from '../iam/index.js';
import { NotificationsService } from '../notify/index.js';
import { EvidenceService } from '../obs/index.js';

const Uuid = z.string().uuid();
const NIN = z.string().trim().toUpperCase().regex(/^C[MF][A-Z0-9]{12}$/, 'a National ID number has 14 characters and starts with CM or CF');
const STATUS: Record<IdentityError['code'], number> = { already_sent: 409, nin_in_use: 409, check_not_found: 404, already_decided: 409, manager_identity_missing: 422 };

function problem(err: unknown): never {
  if (err instanceof IdentityError) {
    const s = STATUS[err.code];
    throw new Problem(s, err.code, s === 404 ? 'Not found' : s === 422 ? 'Unprocessable' : 'Conflict', err.message);
  }
  throw err;
}

@Controller()
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
  ) {}

  /** GET /v1/me/identity: my latest identity check, if any. */
  @Get('me/identity')
  async mine(@CurrentActor() actor: Actor) {
    return { check: (await this.identity.mine(actor.userId)) ?? null };
  }

  /** POST /v1/me/identity: send my National ID number and a photo of my ID (my own upload). */
  @Post('me/identity')
  async send(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = z.object({ nin: NIN, idPhotoEvidenceId: Uuid }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', b.error.issues[0]?.message ?? 'Check the fields');
    const [f] = await this.evidence.view([b.data.idPhotoEvidenceId]);
    if (!f || f.kind !== 'official_document' || f.uploadedBy !== actor.userId) throw new Problem(422, 'id_photo_invalid', 'Unprocessable', 'Upload a photo of your National ID');
    return this.identity.submit(actor.userId, b.data.nin, b.data.idPhotoEvidenceId).catch(problem);
  }

  /** GET /v1/admin/identity-checks?status=pending: the queue, with the ID number and photo. */
  @Get('admin/identity-checks')
  @RequirePermission('identity.approve')
  async list(@Query('status') status?: string) {
    const s = z.enum(['pending', 'approved', 'rejected']).safeParse(status ?? 'pending');
    if (!s.success) throw badRequest('invalid_query', 'Unknown status');
    return { items: await this.identity.list(s.data) };
  }

  /** GET /v1/admin/organisations/:id/managers: each active manager and where their identity check stands. */
  @Get('admin/organisations/:id/managers')
  @RequirePermission('organisation.approve')
  async managers(@Param('id') id: string) {
    if (!Uuid.safeParse(id).success || !(await this.iam.organisation(id))) throw notFound('organisation_not_found', 'No such organisation');
    const managers = (await this.iam.listMembers(id)).filter((m) => m.status === 'active' && m.role === 'org_manager');
    const ids = managers.map((m) => m.userId);
    const status = await this.identity.statusOf(ids);
    const checks = [...(await this.identity.list('pending', ids)), ...(await this.identity.list('approved', ids))];
    return { items: managers.map((m) => {
      const c = checks.find((x) => x.userId === m.userId);
      return { userId: m.userId, name: m.displayName, identity: status.get(m.userId), ...(c ? { checkId: c.checkId, nin: c.nin, idPhotoEvidenceId: c.idPhotoEvidenceId, person: c.person } : {}) };
    }) };
  }

  /** POST /v1/admin/identity-checks/:id/decision: approve or reject one check, with a reason the person sees. */
  @Post('admin/identity-checks/:id/decision')
  @HttpCode(200)
  @RequirePermission('identity.approve')
  async decide(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().min(3).max(500).transform(tidySentence) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'decision and reason are required');
    if (!Uuid.safeParse(id).success) throw notFound('check_not_found', 'No such check');
    const check = await this.identity.decide(actor, id, b.data.decision, b.data.reason).catch(problem);
    const userId = await this.identity.owner(id);
    const phone = userId ? await this.iam.userPhone(userId) : undefined;
    if (phone) {
      await this.notify.sendSmsToPhone(phone, b.data.decision === 'approve' ? 'identity_approved' : 'identity_rejected', { reason: b.data.reason.slice(0, 120) }, 'account', userId!)
        .catch(() => false);
    }
    return check;
  }
}

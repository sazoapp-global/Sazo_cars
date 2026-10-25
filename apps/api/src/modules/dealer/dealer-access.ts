// Every dealer screen acts for one dealer named in the X-Organisation-Id header: the person must work there
// (with the permission the route needs) and the business must be an approved dealer. Routes that keep the work
// private to the dealer (stock, costs, photos, settings) also open while the dealer waits for approval.
import { z } from 'zod';
import { Problem, badRequest } from '../../platform/problem.js';
import { canForOrg, type Actor, type IamService } from '../iam/index.js';

export type DealerPermission = 'dealer.stock.manage' | 'dealer.costs.manage';

export async function dealerOrg(iam: IamService, actor: Actor, orgId: string | undefined, permission: DealerPermission = 'dealer.stock.manage', opts: { beforeApproval?: boolean } = {}): Promise<string> {
  if (!orgId || !z.string().uuid().safeParse(orgId).success) throw badRequest('organisation_required', 'Send the X-Organisation-Id header');
  const access = canForOrg(actor, orgId, permission, opts);
  if (!access.ok) {
    if (access.code === 'organisation_not_approved') throw new Problem(403, 'organisation_not_approved', 'Forbidden', 'Your business has not been approved yet');
    throw new Problem(403, 'forbidden', 'Forbidden', permission === 'dealer.costs.manage' ? 'Only a manager can see or change costs and settings' : 'You cannot do this for this organisation');
  }
  const type = access.membership?.organisationType ?? (await iam.organisation(orgId))?.type;
  if (type !== 'dealer') throw new Problem(403, 'not_a_dealer', 'Forbidden', 'This organisation is not a dealer');
  return orgId;
}

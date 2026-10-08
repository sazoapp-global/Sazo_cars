// Account settings: the person's own data (Uganda Data Protection and Privacy Act 2019 — access, correction,
// objection, erasure). This module owns no data; it asks each module to show or forget what it holds.
import { Inject, Injectable } from '@nestjs/common';
import { CommunityService } from '../community/index.js';
import { IamService, type Actor } from '../iam/index.js';
import { NotificationsService } from '../notify/index.js';
import { PartiesService } from '../obs/index.js';
import { BuyerService, OwnershipService } from '../report/index.js';

export class AccountError extends Error {
  constructor(readonly code: 'hand_over_first', message: string, readonly details: string[] = []) {
    super(message);
  }
}

@Injectable()
export class AccountService {
  constructor(
    @Inject(IamService) private readonly iam: IamService,
    @Inject(PartiesService) private readonly parties: PartiesService,
    @Inject(BuyerService) private readonly buyer: BuyerService,
    @Inject(OwnershipService) private readonly ownership: OwnershipService,
    @Inject(CommunityService) private readonly community: CommunityService,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
  ) {}

  async preferences(userId: string) {
    const phone = await this.iam.userPhone(userId);
    return { visitConfirmationTexts: phone ? await this.parties.visitTextsAllowed(phone) : true };
  }

  async setPreferences(actor: Actor, p: { visitConfirmationTexts: boolean }) {
    const phone = await this.iam.userPhone(actor.userId);
    if (phone) await this.parties.setVisitTexts(phone, p.visitConfirmationTexts);
    await this.iam.audit({ actor, action: 'account.preferences', targetType: 'user', targetId: actor.userId, details: p });
    return this.preferences(actor.userId);
  }

  /** Everything SAZO holds that is about this person, in one file. */
  async export(actor: Actor) {
    const [profile, saved, shares, cars, contributions, prefs, devices] = await Promise.all([
      this.iam.profile(actor.userId), this.buyer.saved(actor.userId), this.buyer.myShares(actor.userId), this.ownership.myCars(actor.userId),
      this.community.contributions(actor.userId), this.preferences(actor.userId), this.iam.devices(actor.userId, actor.sessionId),
    ]);
    await this.iam.audit({ actor, action: 'account.export', targetType: 'user', targetId: actor.userId });
    return {
      exportedAt: new Date().toISOString(),
      about: 'Your data held by SAZO. Records about cars (services, inspections, registrations) belong to each car\'s history and are not included.',
      profile, preferences: prefs, devices,
      savedCars: saved.map((s) => ({ vehicleRef: s.vehicleRef, savedAt: s.savedAt })),
      sharedReports: shares, myCars: cars.map((c) => ({ vehicleRef: c.vehicleRef, status: c.status, method: c.method, claimedAt: c.claimedAt })),
      reviews: contributions.reviews, videoSuggestions: contributions.videos,
    };
  }

  /**
   * Delete the account. Refused while the person is the only manager of a business with other staff.
   * Removed: name, phone, sign-ins, saved cars, share links, car claims, reviews, and the encrypted personal
   * record SAZO holds for their phone. Kept, without their name: records about cars they entered for a business.
   */
  async delete(actor: Actor): Promise<void> {
    const sole = await this.iam.soleManagerOf(actor.userId);
    if (sole.length) throw new AccountError('hand_over_first', `Make someone else a manager of ${sole.join(', ')} first`, sole);
    const phone = await this.iam.userPhone(actor.userId);
    await this.buyer.forget(actor.userId);
    await this.ownership.withdrawAll(actor.userId);
    await this.community.removeAll(actor.userId);
    if (phone) await this.parties.eraseByPhone(phone);
    await this.iam.anonymise(actor);
    if (phone) await this.notify.sendSmsToPhone(phone, 'account_deleted', {}, 'account').catch(() => false);
  }
}

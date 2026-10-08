// Community — module 10 (D-063, P-008): reviews and creator videos about a car MODEL (make/model/generation),
// never about one car. Everything waits for a SAZO moderator. Reviews by people SAZO has confirmed own a car
// of that model are marked "verified owner". Owns the `community` schema.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IamService, type Actor } from '../iam/index.js';
import { ReferenceService, modelLabel } from '../ref/index.js';
import { OwnershipService } from '../report/index.js';

export class CommunityError extends Error {
  constructor(readonly code: 'model_not_found' | 'already_reviewed' | 'link_not_allowed' | 'link_exists' | 'case_not_found', message: string) {
    super(message);
  }
}

/** Video platforms people may link to (P-008). Anything else is refused. */
const PLATFORMS: [RegExp, 'tiktok' | 'youtube' | 'instagram'][] = [
  [/^(www\.|m\.|vm\.)?tiktok\.com$/, 'tiktok'], [/^(www\.|m\.)?youtube\.com$|^youtu\.be$/, 'youtube'], [/^(www\.)?instagram\.com$/, 'instagram'],
];
export function platformOf(url: string): 'tiktok' | 'youtube' | 'instagram' | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return undefined;
    return PLATFORMS.find(([re]) => re.test(u.hostname.toLowerCase()))?.[1];
  } catch {
    return undefined;
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? 'SAZO user';

@Injectable()
export class CommunityService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(ReferenceService) private readonly reference: ReferenceService,
    @Inject(OwnershipService) private readonly ownership: OwnershipService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  private async requireModel(modelId: string) {
    const m = await this.reference.model(modelId);
    if (!m) throw new CommunityError('model_not_found', 'No such model');
    return m;
  }

  /** What anyone can read about a model: published reviews (first name only) and published creator videos. */
  async forModel(modelId: string, viewerId?: string) {
    const m = await this.requireModel(modelId);
    const { rows: reviews } = await this.pool.query<{ id: string; author: string; verified: boolean; rating: number; body: string; createdAt: Date }>(
      `SELECT id, author_user_id AS author, verified_owner AS verified, rating, body, created_at AS "createdAt" FROM community.model_reviews
        WHERE model_id = $1 AND status = 'published' ORDER BY verified_owner DESC, created_at DESC LIMIT 50`, [modelId]);
    const { rows: links } = await this.pool.query<{ id: string; url: string; platform: string; title: string | null }>(
      `SELECT id, url, platform, title FROM community.creator_links WHERE model_id = $1 AND status = 'published' ORDER BY created_at DESC LIMIT 20`, [modelId]);
    const names = await this.iam.displayNames(reviews.map((r) => r.author));
    const mine = viewerId ? (await this.pool.query<{ status: string }>(
      `SELECT status FROM community.model_reviews WHERE model_id = $1 AND author_user_id = $2 AND status IN ('pending','published')`, [modelId, viewerId])).rows[0]?.status ?? null : null;
    return {
      model: { modelId, label: modelLabel(m) },
      reviewCount: reviews.length,
      // An average only means something with a few reviews.
      averageRating: reviews.length >= 3 ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null,
      reviews: reviews.map((r) => ({ reviewId: r.id, author: firstName(names.get(r.author) ?? ''), verifiedOwner: r.verified, rating: r.rating, body: r.body, createdAt: new Date(r.createdAt).toISOString() })),
      creatorLinks: links.map((l) => ({ linkId: l.id, url: l.url, platform: l.platform, title: l.title })),
      myReviewStatus: mine as 'pending' | 'published' | null,
    };
  }

  /** Has SAZO confirmed this person owns a car of this make and model (O-007)? */
  private async ownsModel(userId: string, make: string, model: string): Promise<boolean> {
    const cars = await this.ownership.myCars(userId);
    return cars.some((c) => c.status === 'verified' && c.summary?.vehicle && String((c.summary.vehicle as { make?: string }).make ?? '').toLowerCase() === make.toLowerCase()
      && String((c.summary.vehicle as { model?: string }).model ?? '').toLowerCase() === model.toLowerCase());
  }

  async review(actor: Actor, modelId: string, r: { rating: number; body: string }) {
    const m = await this.requireModel(modelId);
    const verified = await this.ownsModel(actor.userId, m.make, m.model);
    return withTx(this.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO community.model_reviews (model_id, author_user_id, verified_owner, rating, body) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING RETURNING id`, [modelId, actor.userId, verified, r.rating, r.body]);
      if (!rows[0]) throw new CommunityError('already_reviewed', 'You have already reviewed this model');
      await tx.query(`INSERT INTO community.moderation_cases (target_type, target_id) VALUES ('model_review', $1)`, [rows[0].id]);
      return { reviewId: rows[0].id, status: 'pending' as const, verifiedOwner: verified };
    });
  }

  async suggestLink(actor: Actor, modelId: string, l: { url: string; title?: string }) {
    await this.requireModel(modelId);
    const platform = platformOf(l.url);
    if (!platform) throw new CommunityError('link_not_allowed', 'Only https links to TikTok, YouTube or Instagram videos can be suggested');
    return withTx(this.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO community.creator_links (model_id, url, platform, title, submitted_by_user_id) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (model_id, url) DO NOTHING RETURNING id`, [modelId, l.url, platform, l.title ?? null, actor.userId]);
      if (!rows[0]) throw new CommunityError('link_exists', 'This video has already been suggested for this model');
      await tx.query(`INSERT INTO community.moderation_cases (target_type, target_id) VALUES ('creator_link', $1)`, [rows[0].id]);
      return { linkId: rows[0].id, status: 'pending' as const, platform };
    });
  }

  // ---------- moderators (P-008)
  async queue(status: 'open' | 'approved' | 'rejected') {
    const { rows } = await this.pool.query<{ id: string; targetType: 'model_review' | 'creator_link'; targetId: string; reason: string | null; createdAt: Date }>(
      `SELECT id, target_type AS "targetType", target_id AS "targetId", reason, created_at AS "createdAt" FROM community.moderation_cases
        WHERE status = $1 ORDER BY created_at LIMIT 100`, [status]);
    const out = [];
    for (const c of rows) {
      const item = c.targetType === 'model_review'
        ? (await this.pool.query<{ modelId: string; author: string; verified: boolean; rating: number; body: string }>(
          `SELECT model_id AS "modelId", author_user_id AS author, verified_owner AS verified, rating, body FROM community.model_reviews WHERE id = $1`, [c.targetId])).rows[0]
        : (await this.pool.query<{ modelId: string; author: string; url: string; platform: string; title: string | null }>(
          `SELECT model_id AS "modelId", submitted_by_user_id AS author, url, platform, title FROM community.creator_links WHERE id = $1`, [c.targetId])).rows[0];
      if (!item) continue;
      const m = await this.reference.model(item.modelId);
      const names = await this.iam.displayNames([item.author]);
      out.push({ caseId: c.id, type: c.targetType, model: m ? modelLabel(m) : '', author: names.get(item.author) ?? '', submittedAt: new Date(c.createdAt).toISOString(), reason: c.reason,
        ...('body' in item ? { rating: item.rating, body: item.body, verifiedOwner: item.verified } : { url: item.url, platform: item.platform, title: item.title }) });
    }
    return out;
  }

  async decide(moderator: Actor, caseId: string, decision: 'approve' | 'reject', reason: string): Promise<void> {
    await withTx(this.pool, async (tx) => {
      const { rows } = await tx.query<{ targetType: string; targetId: string }>(
        `UPDATE community.moderation_cases SET status = $2, reviewer_user_id = $3, reason = $4, decided_at = now() WHERE id = $1 AND status = 'open'
         RETURNING target_type AS "targetType", target_id AS "targetId"`, [caseId, decision === 'approve' ? 'approved' : 'rejected', moderator.userId, reason]);
      const c = rows[0];
      if (!c) throw new CommunityError('case_not_found', 'No such open case');
      const table = c.targetType === 'model_review' ? 'community.model_reviews' : 'community.creator_links';
      await tx.query(`UPDATE ${table} SET status = $2 WHERE id = $1`, [c.targetId, decision === 'approve' ? 'published' : 'rejected']);
    });
    await this.iam.audit({ actor: moderator, action: `moderation.${decision}`, targetType: 'moderation_case', targetId: caseId, details: { reason } });
  }
}

import { formatDate } from '@sazo/contracts';
import { api } from '@/lib/api';
import type { ModelCommunity as Community } from '@/lib/types';
import { postReview, suggestVideo } from '../app/buyer-actions';
import { Icon } from './icon';

const PLATFORM: Record<string, string> = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' };
const Stars = ({ n }: { n: number }) => (
  <span className="inline-flex items-center gap-0.5 text-warn-text" aria-label={`${n} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" size={16} className={i <= n ? '' : 'opacity-25'} />)}
  </span>
);

/** What owners say about the MODEL (D-063) — opinions, kept apart from this car's records. Moderated (P-008). */
export async function ModelCommunity({ vehicleRef, modelId, done, error }: { vehicleRef: string; modelId: string; done?: string; error?: string }) {
  const c = await api<Community>(`/models/${modelId}/community`, { auth: true }).catch(() => undefined);
  if (!c) return null;
  return (
    <section id="community" className="card scroll-mt-4 p-4 md:p-5" aria-labelledby="community-h">
      <h2 id="community-h" className="font-display text-lg font-semibold">What owners say about the {c.model.label}</h2>
      <p className="text-sm text-muted">Opinions about this model in general — not records about this car. Checked by SAZO before they appear.</p>
      {done && <p role="status" className="mt-2 rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{done}</p>}
      {error && <p role="alert" className="mt-2 rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{error}</p>}
      {c.averageRating !== null && <p className="mt-2 flex items-center gap-2 font-semibold"><Stars n={Math.round(c.averageRating)} />{c.averageRating} from {c.reviewCount} reviews</p>}

      {c.reviews.length === 0 ? <p className="mt-3 text-muted">No reviews yet.</p> : (
        <ul className="mt-3 divide-y divide-line">
          {c.reviews.map((r) => (
            <li key={r.reviewId} className="py-3">
              <div className="flex flex-wrap items-center gap-2"><Stars n={r.rating} /><span className="font-semibold">{r.author}</span>
                {r.verifiedOwner && <span className="chip border-ok-line bg-ok-fill text-ok-text"><Icon name="verified" size={14} />Verified owner</span>}
                <span className="text-xs text-muted">{formatDate(r.createdAt)}</span></div>
              <p className="mt-1 whitespace-pre-line">{r.body}</p>
            </li>
          ))}
        </ul>
      )}

      {c.creatorLinks.length > 0 && (
        <>
          <h3 className="mt-4 font-semibold">Videos about this model</h3>
          <ul className="mt-2 space-y-1">{c.creatorLinks.map((l) => (
            <li key={l.linkId}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="link inline-flex items-center gap-1">
              <Icon name="play_circle" size={18} />{l.title ?? `${PLATFORM[l.platform] ?? 'Video'} video`}<span className="text-sm text-muted">({PLATFORM[l.platform] ?? 'video'})</span></a></li>
          ))}</ul>
        </>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {c.myReviewStatus ? (
          <p className="rounded-lg bg-soft p-3 text-sm">{c.myReviewStatus === 'pending' ? 'Your review is waiting for SAZO to check it.' : 'Thank you — your review is published.'}</p>
        ) : (
          <form action={postReview} className="space-y-2 rounded-lg bg-soft p-3">
            <input type="hidden" name="ref" value={vehicleRef} /><input type="hidden" name="modelId" value={c.model.modelId} />
            <fieldset><legend className="label">Own or drove one? Rate the {c.model.label}</legend>
              <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="pill cursor-pointer has-[:checked]:border-primary-container has-[:checked]:bg-primary-container has-[:checked]:text-white">
                  <input type="radio" name="rating" value={n} required className="sr-only" />{n} {n === 1 ? 'star' : 'stars'}</label>
              ))}</div></fieldset>
            <label htmlFor="review-body" className="label">Your experience (no names or phone numbers)</label>
            <textarea id="review-body" name="body" required minLength={30} maxLength={2000} rows={3} className="field !min-h-24 py-3" />
            <button className="btn btn-ghost"><Icon name="forum" />Send review</button>
          </form>
        )}
        <form action={suggestVideo} className="space-y-2 rounded-lg bg-soft p-3">
          <input type="hidden" name="ref" value={vehicleRef} /><input type="hidden" name="modelId" value={c.model.modelId} />
          <label htmlFor="video-url" className="label">Suggest a TikTok, YouTube or Instagram video about this model</label>
          <input id="video-url" name="url" type="url" required placeholder="https://" className="field" />
          <label htmlFor="video-title" className="label">Title (optional)</label>
          <input id="video-title" name="title" maxLength={120} className="field" />
          <button className="btn btn-ghost"><Icon name="play_circle" />Suggest video</button>
        </form>
      </div>
    </section>
  );
}

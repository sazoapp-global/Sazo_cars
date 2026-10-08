// A buyer reviews a car MODEL and suggests a video (D-063); nothing appears until a SAZO moderator publishes it (P-008).
import { expect, test } from '@playwright/test';
import { a11y, createAdmin, shot, signIn } from './helpers';

const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567130${stamp}`;
const BUYER = `+2567140${stamp}`;

test.beforeAll(() => createAdmin(ADMIN, 'Ruth (SAZO moderator)'));

test('review a model, suggest a video, moderator publishes', async ({ browser }) => {
  const buyer = await (await browser.newContext()).newPage();
  await signIn(buyer, BUYER, { name: `Peter Ssemanda ${stamp}`, next: '/check?q=UAW%20208H' });
  const section = buyer.getByRole('region', { name: /What owners say about the/ });
  await expect(section).toContainText('not records about this car');
  await expect(section).toContainText('No reviews yet.');
  await section.getByText('4 stars').click();
  await section.getByLabel(/Your experience/).fill(`Reliable for daily Kampala driving; parts are cheap and easy to find. (${stamp})`);
  await section.getByRole('button', { name: 'Send review' }).click();
  await expect(buyer.getByText('Your review will appear once SAZO has checked it.')).toBeVisible();
  await expect(section).toContainText('Your review is waiting for SAZO to check it.');
  await section.getByLabel(/Suggest a TikTok, YouTube or Instagram video/).fill(`https://www.youtube.com/watch?v=e2e${stamp}`);
  await section.getByLabel('Title (optional)').fill(`Owner review ${stamp}`);
  await section.getByRole('button', { name: 'Suggest video' }).click();
  await expect(buyer.getByText('The video will appear once SAZO has checked it.')).toBeVisible();
  await a11y(buyer);
  const carUrl = buyer.url().replace(/\?.*$/, '');

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin/moderation' });
  await a11y(admin);
  for (const text of [`(${stamp})`, `Owner review ${stamp}`]) {
    const card = admin.getByRole('listitem').filter({ hasText: text });
    await card.getByLabel(/Reason/).fill('About the model; no personal details');
    await card.getByRole('button', { name: 'Publish' }).click();
    await expect(admin.getByRole('status')).toContainText('Published');
  }

  await buyer.goto(carUrl);
  await expect(section).toContainText(`(${stamp})`);
  await expect(section).toContainText('Peter');
  await expect(section).not.toContainText('Ssemanda');
  await expect(section.getByRole('link', { name: new RegExp(`Owner review ${stamp}`) })).toHaveAttribute('rel', /nofollow/);
  await shot(buyer, 'community');
});

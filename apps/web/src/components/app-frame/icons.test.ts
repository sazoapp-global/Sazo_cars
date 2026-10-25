// Every icon the navigation list names must exist in the website's icon set.
import { WORKSPACES, isGroup } from '@sazo/contracts';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../icon-paths';

describe('navigation icons', () => {
  it('are all in the icon set', () => {
    const names = Object.values(WORKSPACES).flatMap((w) => w.entries.flatMap((e) => (isGroup(e) ? [e.icon, ...e.links.map((l) => l.icon)] : [e.icon])));
    expect(names.filter((n) => !(n in ICONS))).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { pageHref, pageNumbers, paginate } from './pager';

const list = Array.from({ length: 23 }, (_, i) => i + 1);

describe('pages of 10 (4 Nov 2026)', () => {
  it('cuts a list into pages of 10 and says which ones are shown', () => {
    expect(paginate(list, undefined)).toMatchObject({ items: list.slice(0, 10), page: 1, pages: 3, total: 23, from: 1, to: 10 });
    expect(paginate(list, '3')).toMatchObject({ items: [21, 22, 23], page: 3, from: 21, to: 23 });
  });

  it('a page past the end shows the last one; anything unreadable shows the first', () => {
    expect(paginate(list, '9').page).toBe(3);
    for (const bad of ['0', '-2', 'abc', '1.5', '']) expect(paginate(list, bad).page).toBe(1);
    expect(paginate([], '2')).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });

  it('keeps the filters and changes only this list’s page in the address', () => {
    const href = pageHref('/dealer/x', { show: 'sold', q: 'UBK', page: '2', empty: '' });
    expect(href(3)).toBe('/dealer/x?show=sold&q=UBK&page=3');
    expect(href(1)).toBe('/dealer/x?show=sold&q=UBK');
    expect(pageHref('/v/1', { view: 'records', rp: '4' }, 'rp')(2)).toBe('/v/1?view=records&rp=2');
  });

  it('shows every number up to 7 pages, then the ends and the pages around this one', () => {
    expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
    expect(pageNumbers(20, 20)).toEqual([1, 'gap', 17, 18, 19, 20]);
  });
});

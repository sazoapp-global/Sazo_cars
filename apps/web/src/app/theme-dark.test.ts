// The "same as device" copy of the dark rules must stay identical to the chosen-dark rules.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dark mode stylesheet', () => {
  it('applies the same rules for "dark" and for "same as device" on a dark device', () => {
    const css = readFileSync(new URL('./theme-dark.css', import.meta.url), 'utf8');
    const chosen = css.slice(css.indexOf('@media screen {'), css.indexOf('/* Same as device'));
    const system = css.slice(css.indexOf('@media screen and (prefers-color-scheme: dark)'));
    const rules = (block: string) => block.slice(block.indexOf('{') + 1).replace(/^ *\[data-theme='light'\][^\n]*\n/m, '').trim().replace(/}\s*$/, '').trim();
    expect(rules(system)).toBe(rules(chosen).replaceAll("[data-theme='dark']", ':root:not([data-theme])'));
  });
});

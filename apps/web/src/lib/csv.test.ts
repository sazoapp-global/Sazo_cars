import { describe, expect, it } from 'vitest';
import { csvCell, csvRecords, parseCsv } from './csv';

describe('CSV', () => {
  it('reads quotes, commas and line breaks inside quotes, CRLF and the Excel BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",3\n\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', '3']]);
  });
  it('maps rows to the header', () => {
    expect(csvRecords('plate,record_type\nUAA 111A,stolen_reported\n').records).toEqual([{ plate: 'UAA 111A', record_type: 'stolen_reported' }]);
  });
  it('writes safe cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});

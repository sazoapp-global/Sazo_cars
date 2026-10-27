'use client';
// A select that sends its form as soon as a choice is made (for list filters), so there is no extra button to press.
import type { SelectHTMLAttributes } from 'react';

export function SubmitOnChange(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

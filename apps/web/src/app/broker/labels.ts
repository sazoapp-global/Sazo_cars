// Where a broker's commission stands, in the broker's own words (D-185).
export const PAY: Record<string, string> = { awaiting_payment: 'Due at the buyer’s first payment', on_hold: 'Waiting for the dealer to decide', pending: 'Waiting for approval', approved: 'Approved, not paid yet', paid: 'Paid', cancelled: 'Cancelled' };

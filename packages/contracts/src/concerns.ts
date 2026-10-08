// Concerns a garage or inspector can report about a car (O-002), shared by the API, the phone app and the website.
export const CONCERN_CATEGORIES = ['cloned_plate', 'chassis_tampered', 'odometer_tampered', 'stolen_suspected', 'fake_documents', 'other'] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

export const CONCERNS: Record<ConcernCategory, { label: string; hint: string; severity: 'serious' | 'attention'; upheld: string }> = {
  cloned_plate: { label: 'Plate does not belong to this car', hint: 'The plate seems copied from another car, or does not match the logbook.', severity: 'serious',
    upheld: 'SAZO checked a report that this car’s number plate does not belong to it, and found the report valid.' },
  chassis_tampered: { label: 'Chassis or VIN looks tampered with', hint: 'Ground off, re-stamped, welded, or a plate that has been replaced.', severity: 'serious',
    upheld: 'SAZO checked a report that this car’s chassis number was tampered with, and found the report valid.' },
  odometer_tampered: { label: 'Mileage has been wound back', hint: 'Signs the odometer was changed or the reading does not fit the wear.', severity: 'serious',
    upheld: 'SAZO checked a report that this car’s mileage was wound back, and found the report valid.' },
  stolen_suspected: { label: 'May be stolen', hint: 'Something suggests the car is stolen. If you are sure, also tell the police.', severity: 'serious',
    upheld: 'SAZO checked a report that this car may be stolen, and found reasons for concern. Check with the police before buying.' },
  fake_documents: { label: 'Papers look fake', hint: 'Logbook, import or other papers that do not look genuine.', severity: 'serious',
    upheld: 'SAZO checked a report that this car’s papers were not genuine, and found the report valid.' },
  other: { label: 'Something else', hint: 'Anything else a buyer should know about.', severity: 'attention',
    upheld: 'SAZO checked a concern a business raised about this car, and found it valid. Ask the seller about it.' },
};

/** The neutral notice shown while a serious concern is open — it accuses nobody (P-006). */
export const CONCERN_UNDER_REVIEW = 'A business has raised a concern about this car. SAZO is checking it. Look closely at the car and its papers before you pay.';

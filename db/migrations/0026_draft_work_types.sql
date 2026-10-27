-- A garage job draft may be saved before the work is chosen (27 Oct 2026): the phone saves as soon as the car is
-- found. Sending still needs at least one kind of work (checked by the API before a job is sent).
ALTER TABLE garage.jobs DROP CONSTRAINT IF EXISTS jobs_work_types_check;
ALTER TABLE garage.jobs ADD CONSTRAINT jobs_work_types_check CHECK (status = 'draft' OR cardinality(work_types) > 0);

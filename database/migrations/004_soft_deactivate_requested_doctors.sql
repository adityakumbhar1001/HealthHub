-- Add reversible doctor deactivation while preserving appointment foreign keys.
ALTER TABLE doctors
    ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;

-- IDs were confirmed against the caresphere database before applying this migration.
-- Match the identifying details as well so the migration cannot deactivate a changed row.
UPDATE doctors
SET is_active = 0
WHERE (doctor_id = 1 AND name = 'Dr. Amit Kulkarni' AND specialization = 'Cardiology')
   OR (doctor_id = 5 AND name = 'Derw' AND (specialization IS NULL OR TRIM(specialization) = ''))
   OR (doctor_id = 6 AND name = 'Ak' AND specialization = 'Eyes');

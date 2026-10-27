-- Add query indexes only; keep existing appointment and foreign-key indexes intact.
CREATE INDEX idx_appointments_doctor_status_date_time
    ON appointments(doctor_id,status,appointment_date,appointment_time);

CREATE INDEX idx_appointments_date_doctor_status_time
    ON appointments(appointment_date,doctor_id,status,appointment_time);

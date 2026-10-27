-- Run after 001_seed_predefined_doctors.sql. Preserves all existing appointments and doctors.
ALTER TABLE appointments
    ADD COLUMN duration_minutes INT NULL,
    ADD COLUMN appointment_end_time TIME NULL;

-- Existing appointment durations were never stored; leave those historical values unknown.
-- New appointments always write both duration_minutes and appointment_end_time.

CREATE TABLE doctor_working_hours (
    working_hours_id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    day_of_week TINYINT NOT NULL COMMENT 'MySQL DAYOFWEEK: Sunday=1 through Saturday=7',
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT chk_doctor_working_hours_day CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT chk_doctor_working_hours_range CHECK (start_time < end_time),
    CONSTRAINT fk_doctor_working_hours_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    INDEX idx_doctor_working_hours_lookup (doctor_id, day_of_week, is_active)
);

-- Initial hours confirmed for this installation: weekdays, 09:00-13:00.
-- Select actual database doctor IDs by name/specialization; never assume their IDs.
INSERT INTO doctor_working_hours(doctor_id,day_of_week,start_time,end_time,is_active)
SELECT doctor.doctor_id, weekday.day_of_week, '09:00:00', '13:00:00', 1
FROM (
    SELECT MIN(doctor_id) AS doctor_id, name, specialization
    FROM doctors
    GROUP BY name, specialization
) AS doctor
JOIN (
    SELECT 2 AS day_of_week UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) AS weekday
WHERE (doctor.name='Dr. Neha Joshi' AND doctor.specialization='General Medicine'
    OR doctor.name='Dr. Amit Kumar' AND doctor.specialization='Cardiology'
    OR doctor.name='Dr. Priya Sharma' AND doctor.specialization='Dermatology'
    OR doctor.name='Dr. Rahul Deshmukh' AND doctor.specialization='Orthopedics'
    OR doctor.name='Dr. Sneha Patil' AND doctor.specialization='Pediatrics'
    OR doctor.name='Dr. Arjun Mehta' AND doctor.specialization='Neurology')
  AND NOT EXISTS (
      SELECT 1 FROM doctor_working_hours existing
      WHERE existing.doctor_id=doctor.doctor_id AND existing.day_of_week=weekday.day_of_week
  );

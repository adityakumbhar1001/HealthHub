-- Safe to run more than once. Existing doctors are retained; only missing name/specialization pairs are added.
INSERT INTO doctors(name,specialization,experience,phone)
SELECT 'Dr. Neha Joshi','General Medicine',6,'9876500002'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Neha Joshi' AND specialization='General Medicine');

INSERT INTO doctors(name,specialization,experience,phone)
SELECT 'Dr. Amit Kumar','Cardiology',10,'9876500003'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Amit Kumar' AND specialization='Cardiology');

INSERT INTO doctors(name,specialization,experience,phone)
SELECT 'Dr. Priya Sharma','Dermatology',8,'9876500004'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Priya Sharma' AND specialization='Dermatology');

INSERT INTO doctors(name,specialization,experience,phone)
SELECT 'Dr. Rahul Deshmukh','Orthopedics',9,'9876500005'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Rahul Deshmukh' AND specialization='Orthopedics');

INSERT INTO doctors(name,specialization,experience,phone)
SELECT 'Dr. Sneha Patil','Pediatrics',7,'9876500006'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Sneha Patil' AND specialization='Pediatrics');

INSERT INTO doctors(name,specialization,experience,phone)
SELECT 'Dr. Arjun Mehta','Neurology',8,'9876500007'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Arjun Mehta' AND specialization='Neurology');

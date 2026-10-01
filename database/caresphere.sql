CREATE DATABASE IF NOT EXISTS caresphere;
USE caresphere;

DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS lab_tests;
DROP TABLE IF EXISTS medicines;
DROP TABLE IF EXISTS beds;
DROP TABLE IF EXISTS emergency_cases;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    role ENUM('admin','doctor','patient') NOT NULL
);

CREATE TABLE patients (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    disease VARCHAR(100),
    phone VARCHAR(20)
);

CREATE TABLE doctors (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    specialization VARCHAR(100),
    experience INT DEFAULT 0,
    phone VARCHAR(20)
);

CREATE TABLE appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    reason VARCHAR(255),
    status ENUM('Booked','Completed','Cancelled') DEFAULT 'Booked',
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
);

CREATE TABLE emergency_cases (
    case_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_name VARCHAR(100) NOT NULL,
    condition_name VARCHAR(255),
    priority INT NOT NULL,
    status ENUM('Waiting','Treated') DEFAULT 'Waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE beds (
    bed_id INT AUTO_INCREMENT PRIMARY KEY,
    room_no VARCHAR(20) NOT NULL,
    ward VARCHAR(50) NOT NULL,
    status ENUM('Available','Occupied') DEFAULT 'Available',
    patient_id INT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE SET NULL
);

CREATE TABLE medicines (
    medicine_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    price DECIMAL(10,2) NOT NULL,
    expiry_date DATE
);

CREATE TABLE lab_tests (
    test_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    test_name VARCHAR(100) NOT NULL,
    result VARCHAR(255),
    test_date DATE NOT NULL,
    status ENUM('Pending','Completed') DEFAULT 'Pending',
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
);

CREATE TABLE bills (
    bill_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    consultation_fee DECIMAL(10,2) DEFAULT 0,
    medicine_fee DECIMAL(10,2) DEFAULT 0,
    lab_fee DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    bill_date DATE NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
);

INSERT INTO users(username,password,role) VALUES
('admin','admin123','admin'),
('doctor','doctor123','doctor'),
('patient','patient123','patient');

INSERT INTO patients(name,age,gender,blood_group,disease,phone) VALUES
('Rahul Sharma',25,'Male','B+','Fever','9876543210'),
('Priya Patil',32,'Female','O+','Diabetes','9876543211');

INSERT INTO doctors(name,specialization,experience,phone) VALUES
('Dr. Amit Kulkarni','Cardiology',10,'9876500001'),
('Dr. Neha Joshi','General Medicine',6,'9876500002');

INSERT INTO beds(room_no,ward,status) VALUES
('101','General','Available'),
('102','General','Occupied'),
('201','ICU','Available'),
('202','ICU','Available');

INSERT INTO medicines(name,quantity,price,expiry_date) VALUES
('Paracetamol',100,5.00,'2027-12-31'),
('Amoxicillin',30,12.50,'2027-06-30'),
('Insulin',8,350.00,'2027-03-31');

INSERT INTO lab_tests(patient_id,test_name,result,test_date,status) VALUES
(1,'Blood Test','Normal',CURDATE(),'Completed'),
(2,'Blood Sugar','Pending',CURDATE(),'Pending');

INSERT INTO bills(patient_id,consultation_fee,medicine_fee,lab_fee,total,bill_date) VALUES
(1,500,100,250,850,CURDATE());

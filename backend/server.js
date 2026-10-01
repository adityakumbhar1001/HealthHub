const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req,res) => res.json({message:'CareSphere API is running'}));

app.post('/api/login', async (req,res) => {
    try {
        const {username,password} = req.body;
        const [rows] = await pool.query(
            'SELECT user_id, username, role FROM users WHERE username=? AND password=?',
            [username,password]
        );
        if (!rows.length) return res.status(401).json({message:'Invalid username or password'});
        res.json(rows[0]);
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/dashboard', async (req,res) => {
    try {
        const [[p]] = await pool.query('SELECT COUNT(*) AS total FROM patients');
        const [[d]] = await pool.query('SELECT COUNT(*) AS total FROM doctors');
        const [[a]] = await pool.query("SELECT COUNT(*) AS total FROM appointments WHERE status='Booked'");
        const [[b]] = await pool.query("SELECT COUNT(*) AS total FROM beds WHERE status='Available'");
        res.json({patients:p.total, doctors:d.total, appointments:a.total, beds:b.total});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/patients', async (req,res) => {
    try { const [rows] = await pool.query('SELECT * FROM patients ORDER BY patient_id DESC'); res.json(rows); }
    catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/patients', async (req,res) => {
    try {
        const {name,age,gender,blood_group,disease,phone} = req.body;
        if (!name || !age || age <= 0) return res.status(400).json({message:'Valid name and age are required'});
        const [r] = await pool.query(
            'INSERT INTO patients(name,age,gender,blood_group,disease,phone) VALUES(?,?,?,?,?,?)',
            [name,age,gender,blood_group,disease,phone]
        );
        res.status(201).json({message:'Patient added', patient_id:r.insertId});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.delete('/api/patients/:id', async (req,res) => {
    try {
        await pool.query('DELETE FROM patients WHERE patient_id=?',[req.params.id]);
        res.json({message:'Patient deleted'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/doctors', async (req,res) => {
    try { const [rows] = await pool.query('SELECT * FROM doctors ORDER BY doctor_id DESC'); res.json(rows); }
    catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/doctors', async (req,res) => {
    try {
        const {name,specialization,experience,phone} = req.body;
        if (!name) return res.status(400).json({message:'Doctor name is required'});
        const [r] = await pool.query(
            'INSERT INTO doctors(name,specialization,experience,phone) VALUES(?,?,?,?)',
            [name,specialization,experience || 0,phone]
        );
        res.status(201).json({message:'Doctor added', doctor_id:r.insertId});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/appointments', async (req,res) => {
    try {
        const [rows] = await pool.query(`
            SELECT a.*, p.name AS patient_name, d.name AS doctor_name
            FROM appointments a
            JOIN patients p ON a.patient_id=p.patient_id
            JOIN doctors d ON a.doctor_id=d.doctor_id
            ORDER BY a.appointment_date, a.appointment_time
        `);
        res.json(rows);
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/appointments', async (req,res) => {
    try {
        const {patient_id,doctor_id,appointment_date,appointment_time,reason} = req.body;
        const [conflict] = await pool.query(
            `SELECT appointment_id FROM appointments
             WHERE doctor_id=? AND appointment_date=? AND appointment_time=? AND status='Booked'`,
            [doctor_id,appointment_date,appointment_time]
        );
        if (conflict.length) return res.status(409).json({message:'Doctor is already booked at this time'});
        await pool.query(
            `INSERT INTO appointments(patient_id,doctor_id,appointment_date,appointment_time,reason)
             VALUES(?,?,?,?,?)`,
            [patient_id,doctor_id,appointment_date,appointment_time,reason]
        );
        res.status(201).json({message:'Appointment booked'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.put('/api/appointments/:id/cancel', async (req,res) => {
    try {
        await pool.query("UPDATE appointments SET status='Cancelled' WHERE appointment_id=?",[req.params.id]);
        res.json({message:'Appointment cancelled'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/emergency', async (req,res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM emergency_cases ORDER BY priority ASC, created_at ASC');
        res.json(rows);
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/emergency', async (req,res) => {
    try {
        const {patient_name,condition_name,priority} = req.body;
        if (![1,2,3,4].includes(Number(priority))) return res.status(400).json({message:'Priority must be 1 to 4'});
        await pool.query(
            'INSERT INTO emergency_cases(patient_name,condition_name,priority) VALUES(?,?,?)',
            [patient_name,condition_name,priority]
        );
        res.status(201).json({message:'Emergency case added'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.put('/api/emergency/:id/treat', async (req,res) => {
    try {
        await pool.query("UPDATE emergency_cases SET status='Treated' WHERE case_id=?",[req.params.id]);
        res.json({message:'Emergency case marked treated'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/beds', async (req,res) => {
    try { const [rows] = await pool.query('SELECT * FROM beds ORDER BY bed_id'); res.json(rows); }
    catch(e) { res.status(500).json({message:e.message}); }
});

app.put('/api/beds/:id/allocate', async (req,res) => {
    try {
        const {patient_id} = req.body;
        if (!Number.isSafeInteger(Number(patient_id)) || Number(patient_id) <= 0) {
            return res.status(400).json({message:'Enter a valid patient ID'});
        }
        const [r] = await pool.query(
            "UPDATE beds SET status='Occupied', patient_id=? WHERE bed_id=? AND status='Available'",
            [patient_id,req.params.id]
        );
        if (!r.affectedRows) return res.status(400).json({message:'Bed is not available'});
        res.json({message:'Bed allocated'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.put('/api/beds/:id/release', async (req,res) => {
    try {
        await pool.query("UPDATE beds SET status='Available', patient_id=NULL WHERE bed_id=?",[req.params.id]);
        res.json({message:'Bed released'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/medicines', async (req,res) => {
    try { const [rows] = await pool.query('SELECT * FROM medicines ORDER BY medicine_id DESC'); res.json(rows); }
    catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/medicines', async (req,res) => {
    try {
        const {name,quantity,price,expiry_date} = req.body;
        await pool.query(
            'INSERT INTO medicines(name,quantity,price,expiry_date) VALUES(?,?,?,?)',
            [name,quantity,price,expiry_date]
        );
        res.status(201).json({message:'Medicine added'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/labs', async (req,res) => {
    try {
        const [rows] = await pool.query(`
            SELECT l.*, p.name AS patient_name
            FROM lab_tests l JOIN patients p ON l.patient_id=p.patient_id
            ORDER BY l.test_id DESC
        `);
        res.json(rows);
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/labs', async (req,res) => {
    try {
        const {patient_id,test_name,result,status} = req.body;
        await pool.query(
            'INSERT INTO lab_tests(patient_id,test_name,result,test_date,status) VALUES(?,?,?,CURDATE(),?)',
            [patient_id,test_name,result || '',status || 'Pending']
        );
        res.status(201).json({message:'Lab test added'});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/bills', async (req,res) => {
    try {
        const [rows] = await pool.query(`
            SELECT b.*, p.name AS patient_name
            FROM bills b JOIN patients p ON b.patient_id=p.patient_id
            ORDER BY b.bill_id DESC
        `);
        res.json(rows);
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/bills', async (req,res) => {
    try {
        const {patient_id,consultation_fee,medicine_fee,lab_fee} = req.body;
        const total = Number(consultation_fee||0) + Number(medicine_fee||0) + Number(lab_fee||0);
        await pool.query(
            `INSERT INTO bills(patient_id,consultation_fee,medicine_fee,lab_fee,total,bill_date)
             VALUES(?,?,?,?,?,CURDATE())`,
            [patient_id,consultation_fee||0,medicine_fee||0,lab_fee||0,total]
        );
        res.status(201).json({message:'Bill generated',total});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`CareSphere server running on http://localhost:${process.env.PORT || 3000}`);
});

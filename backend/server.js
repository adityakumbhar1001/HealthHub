const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { supportedDurations, timeToMinutes, minutesToTime, dateAfter, findEarliestSlot, isSlotAvailable, summarizeDoctorDay } = require('./scheduler');

const app = express();
app.use(cors());
app.use(express.json());

const bloodGroups = new Set(['A+','A-','B+','B-','AB+','AB-','O+','O-']);
const genders = new Set(['Female','Male','Other','Prefer not to say']);
const diseaseDoctors = new Map([
    ['Fever / Common Cold',['Dr. Neha Joshi','General Medicine']],
    ['Heart-related condition',['Dr. Amit Kumar','Cardiology']],
    ['Skin condition',['Dr. Priya Sharma','Dermatology']],
    ['Bone / Joint problem',['Dr. Rahul Deshmukh','Orthopedics']],
    ["Children's health condition",['Dr. Sneha Patil','Pediatrics']],
    ['Brain / Nervous system condition',['Dr. Arjun Mehta','Neurology']],
    ['Other / General illness',['Dr. Neha Joshi','General Medicine']]
]);
const predefinedDoctors = [
    ['Dr. Neha Joshi','General Medicine',6,'9876500002'],
    ['Dr. Amit Kumar','Cardiology',10,'9876500003'],
    ['Dr. Priya Sharma','Dermatology',8,'9876500004'],
    ['Dr. Rahul Deshmukh','Orthopedics',9,'9876500005'],
    ['Dr. Sneha Patil','Pediatrics',7,'9876500006'],
    ['Dr. Arjun Mehta','Neurology',8,'9876500007']
];

async function ensurePredefinedDoctors(){
    const connection=await pool.getConnection();
    try{
        const [[lock]]=await connection.query("SELECT GET_LOCK('caresphere_predefined_doctors_seed',10) AS acquired");
        if(lock.acquired!==1) throw new Error('Could not acquire doctor initialization lock');
        for(const [name,specialization,experience,phone] of predefinedDoctors){
            const [[existing]]=await connection.query('SELECT doctor_id FROM doctors WHERE name=? AND specialization=? LIMIT 1',[name,specialization]);
            if(!existing) await connection.query('INSERT INTO doctors(name,specialization,experience,phone) VALUES(?,?,?,?)',[name,specialization,experience,phone]);
        }
    }finally{
        try{await connection.query("SELECT RELEASE_LOCK('caresphere_predefined_doctors_seed')");}catch(_){}
        connection.release();
    }
}

function positiveId(value){
    const text=String(value ?? '');
    if(!/^[1-9]\d*$/.test(text)) return null;
    const id=Number(text);
    return Number.isSafeInteger(id) && id<=2147483647 ? id : null;
}

function textValue(value, field, maxLength, required=false){
    if(value===undefined || value===null){
        if(required) return {error:`${field} is required`};
        return {value:''};
    }
    if(typeof value!=='string') return {error:`${field} must be text`};
    const normalized=value.trim();
    if(required && !normalized) return {error:`${field} is required`};
    if(normalized.length>maxLength) return {error:`${field} must be ${maxLength} characters or fewer`};
    return {value:normalized};
}

function integerValue(value, field, min, max, required=true){
    if((value===undefined || value===null || value==='') && !required) return {value:null};
    const text=String(value ?? '');
    if(!/^-?\d+$/.test(text)) return {error:`${field} must be a whole number`};
    const number=Number(text);
    if(!Number.isSafeInteger(number) || number<min || number>max){
        return {error:`${field} must be between ${min} and ${max}`};
    }
    return {value:number};
}

function validDate(value){
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year,month,day]=value.split('-').map(Number);
    const date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day;
}

function validPhone(value){
    const digitCount=(value.match(/[0-9]/g) || []).length;
    return /^\+?[0-9][0-9 ()-]{6,18}[0-9]$/.test(value) && value.length<=20 && digitCount>=8 && digitCount<=15;
}

function schedulingHorizonDays(){
    const days=Number(process.env.APPOINTMENT_SCHEDULING_HORIZON_DAYS || 30);
    if(!Number.isInteger(days) || days<1 || days>365) throw new Error('APPOINTMENT_SCHEDULING_HORIZON_DAYS must be between 1 and 365');
    return days;
}

function localClock(now=new Date()){
    const timeZone=process.env.APPOINTMENT_TIME_ZONE || 'Asia/Kolkata';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return {
        date:`${values.year}-${values.month}-${values.day}`,
        minutes:Number(values.hour)*60+Number(values.minute)+(Number(values.second)>0?1:0)
    };
}

async function doctorLock(connection,doctorId){
    const [[row]]=await connection.query('SELECT GET_LOCK(?,10) AS acquired',[`caresphere_doctor_${doctorId}`]);
    return row.acquired===1;
}

async function lockDoctorRow(connection,doctorId){
    const [[doctor]]=await connection.query('SELECT doctor_id FROM doctors WHERE doctor_id=? AND is_active=1 FOR UPDATE',[doctorId]);
    return Boolean(doctor);
}

async function releaseDoctorLock(connection,doctorId){
    if(!connection) return;
    try{await connection.query('SELECT RELEASE_LOCK(?)',[`caresphere_doctor_${doctorId}`]);}
    catch(_){try{connection.destroy();}catch(__){}}
}

async function readDoctorSchedule(connection,doctorId){
    const [rows]=await connection.query(
        'SELECT day_of_week,start_time,end_time,is_active FROM doctor_working_hours WHERE doctor_id=? AND is_active=1 ORDER BY day_of_week,start_time',
        [doctorId]
    );
    return rows;
}

async function readDoctorAppointments(connection,doctorId,startDate,endDate){
    const [rows]=await connection.query(
        `SELECT doctor_id,appointment_date,appointment_time,appointment_end_time,duration_minutes,status
         FROM appointments WHERE doctor_id=? AND appointment_date>=? AND appointment_date<=? AND status='Booked'
         ORDER BY appointment_date,appointment_time`,
        [doctorId,startDate,endDate]
    );
    return rows;
}

app.get('/api/health', (req,res) => res.json({message:'CareSphere API is running'}));

app.get('/api/appointment-options', (req,res) => {
    try{res.json({durations:supportedDurations()});}
    catch(e){res.status(500).json({message:e.message});}
});

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
    let connection;
    let lockHeld=false;
    let doctorId=null;
    try {
        const name=textValue(req.body?.name,'Name',100,true);
        const age=integerValue(req.body?.age,'Age',1,120);
        const gender=textValue(req.body?.gender,'Gender',20,true);
        const blood=textValue(req.body?.blood_group,'Blood group',10,true);
        const disease=textValue(req.body?.disease,'Disease',100,true);
        const phone=textValue(req.body?.phone,'Phone',20,true);
        const duration=integerValue(req.body?.duration_minutes,'Appointment duration',5,480);
        for(const result of [name,age,gender,blood,disease,phone,duration]){
            if(result.error) return res.status(400).json({message:result.error});
        }
        if(name.value.length<2) return res.status(400).json({message:'Name must be at least 2 characters'});
        if(!genders.has(gender.value)) return res.status(400).json({message:'Select a supported gender'});
        if(!bloodGroups.has(blood.value)) return res.status(400).json({message:'Select a supported blood group'});
        if(!validPhone(phone.value)) return res.status(400).json({message:'Enter a valid phone number'});
        if(!diseaseDoctors.has(disease.value)) return res.status(400).json({message:'Select a supported disease category'});
        if(!supportedDurations().includes(duration.value)) return res.status(400).json({message:'Select a supported appointment duration'});
        const [[doctor]]=await pool.query('SELECT doctor_id,name,specialization FROM doctors WHERE name=? AND specialization=? AND is_active=1 ORDER BY doctor_id LIMIT 1',diseaseDoctors.get(disease.value));
        if(!doctor) return res.status(503).json({message:'Assigned doctor is not configured'});
        doctorId=doctor.doctor_id;
        connection=await pool.getConnection();
        lockHeld=await doctorLock(connection,doctorId);
        if(!lockHeld) return res.status(409).json({message:'Scheduling is busy for this doctor. Please try again.'});
        await connection.beginTransaction();
        if(!await lockDoctorRow(connection,doctorId)){
            await connection.rollback();
            return res.status(404).json({message:'Assigned doctor is no longer available'});
        }
        const horizonDays=schedulingHorizonDays();
        const clock=localClock();
        const lastDate=dateAfter(clock.date,horizonDays-1);
        const workingHours=await readDoctorSchedule(connection,doctorId);
        if(!workingHours.length){
            await connection.rollback();
            return res.status(409).json({message:`No working hours are configured for ${doctor.name}.`});
        }
        const appointments=await readDoctorAppointments(connection,doctorId,clock.date,lastDate);
        const slot=findEarliestSlot({startDate:clock.date,horizonDays,durationMinutes:duration.value,workingHours,appointments,nowMinutes:clock.minutes});
        if(!slot){
            await connection.rollback();
            return res.status(409).json({message:`No ${duration.value}-minute appointment slot is available with ${doctor.name} within the next ${horizonDays} days.`});
        }
        const [r] = await connection.query(
            'INSERT INTO patients(name,age,gender,blood_group,disease,phone) VALUES(?,?,?,?,?,?)',
            [name.value,age.value,gender.value,blood.value,disease.value,phone.value]
        );
        const finalWorkingHours=await readDoctorSchedule(connection,doctorId);
        const finalAppointments=await readDoctorAppointments(connection,doctorId,slot.appointment_date,slot.appointment_date);
        if(!isSlotAvailable({
            date:slot.appointment_date,
            startTime:slot.appointment_time,
            durationMinutes:duration.value,
            workingHours:finalWorkingHours,
            appointments:finalAppointments,
            doctorId
        })){
            await connection.rollback();
            return res.status(409).json({message:'The selected appointment slot is no longer available. Please submit again.'});
        }
        const [appointment]=await connection.query(
            "INSERT INTO appointments(patient_id,doctor_id,appointment_date,appointment_time,appointment_end_time,duration_minutes,reason,status) VALUES(?,?,?,?,?,?,?,'Booked')",
            [r.insertId,doctorId,slot.appointment_date,slot.appointment_time,slot.appointment_end_time,duration.value,disease.value]
        );
        await connection.commit();
        res.status(201).json({message:'Patient and appointment created',patient_id:r.insertId,appointment_id:appointment.insertId,doctor,appointment_date:slot.appointment_date,appointment_time:slot.appointment_time,appointment_end_time:slot.appointment_end_time,duration_minutes:duration.value});
    } catch(e) {
        if(connection) try { await connection.rollback(); } catch(_) {}
        console.error('POST /api/patients failed',{
            message:e?.message || String(e),
            code:e?.code || null,
            stack:e?.stack || null
        });
        res.status(500).json({message:'Unable to register patient and book appointment'});
    } finally {
        if(lockHeld) await releaseDoctorLock(connection,doctorId);
        if(connection) connection.release();
    }
});

app.delete('/api/patients/:id', async (req,res) => {
    try {
        const id=positiveId(req.params.id);
        if(!id) return res.status(400).json({message:'Enter a valid patient ID'});
        const [rows]=await pool.query('SELECT patient_id FROM patients WHERE patient_id=?',[id]);
        if(!rows.length) return res.status(404).json({message:'Patient not found'});
        await pool.query('DELETE FROM patients WHERE patient_id=?',[id]);
        res.json({message:'Patient deleted'});
    } catch(e) { res.status(500).json({message:'Unable to delete patient'}); }
});

app.get('/api/doctors', async (req,res) => {
    try { const [rows] = await pool.query('SELECT * FROM doctors WHERE is_active=1 ORDER BY doctor_id DESC'); res.json(rows); }
    catch(e) { res.status(500).json({message:e.message}); }
});

app.get('/api/doctors/schedule', async (req,res) => {
    try {
        const date=req.query.date===undefined?localClock().date:req.query.date;
        if(!validDate(date)) return res.status(400).json({message:'Enter a valid schedule date in YYYY-MM-DD format'});
        const [doctors]=await pool.query('SELECT doctor_id,name,specialization FROM doctors WHERE is_active=1 ORDER BY name,doctor_id');
        const [workingHours]=await pool.query(
            'SELECT doctor_id,start_time,end_time FROM doctor_working_hours WHERE is_active=1 AND day_of_week=DAYOFWEEK(?) ORDER BY doctor_id,start_time',
            [date]
        );
        const [appointments]=await pool.query(
            `SELECT appointment_id,doctor_id,appointment_date,appointment_time,appointment_end_time,duration_minutes,status
             FROM appointments WHERE appointment_date=? ORDER BY doctor_id,appointment_time,appointment_id`,
            [date]
        );
        const [futureCounts]=await pool.query(
            `SELECT doctor_id,COUNT(*) AS total FROM appointments
             WHERE status='Booked' AND appointment_date>=? GROUP BY doctor_id`,
            [date]
        );
        const hoursByDoctor=new Map();
        for(const row of workingHours){
            if(!hoursByDoctor.has(row.doctor_id)) hoursByDoctor.set(row.doctor_id,[]);
            hoursByDoctor.get(row.doctor_id).push(row);
        }
        const appointmentsByDoctor=new Map();
        for(const row of appointments){
            if(!appointmentsByDoctor.has(row.doctor_id)) appointmentsByDoctor.set(row.doctor_id,[]);
            appointmentsByDoctor.get(row.doctor_id).push(row);
        }
        const futureCountByDoctor=new Map(futureCounts.map(row=>[row.doctor_id,Number(row.total)]));
        res.json({
            date,
            time_zone:process.env.APPOINTMENT_TIME_ZONE||'Asia/Kolkata',
            active_future_count_rule:'Booked appointments with appointment_date on or after the selected date',
            selected_date_metrics_rule:'Selected-date appointment counts, recorded duration, and free time include only status=Booked appointments for the selected date and doctor',
            doctors:doctors.map(doctor=>{
                const summary=summarizeDoctorDay({
                    date,
                    workingHours:hoursByDoctor.get(doctor.doctor_id)||[],
                    appointments:appointmentsByDoctor.get(doctor.doctor_id)||[]
                });
                return {
                    doctor_id:doctor.doctor_id,
                    name:doctor.name,
                    specialization:doctor.specialization,
                    active_future_appointment_count:futureCountByDoctor.get(doctor.doctor_id)||0,
                    selected_date_appointment_count:summary.booked_appointment_count,
                    ...summary,
                    availability_message:!summary.working_hours_configured
                        ? 'Working hours not configured'
                        : summary.appointments.length===0
                            ? 'No appointments scheduled'
                            : summary.booked_appointment_count===0
                                ? 'No active booked appointments'
                                : summary.fully_booked?'Fully booked':'Appointments scheduled'
                };
            })
        });
    } catch(e) { res.status(500).json({message:'Unable to load doctor schedules'}); }
});

app.get('/api/doctor-assignment/:disease', async (req,res) => {
    try {
        const target=diseaseDoctors.get(req.params.disease);
        if(!target) return res.status(400).json({message:'Select a supported disease category'});
        const [[doctor]]=await pool.query('SELECT doctor_id,name,specialization FROM doctors WHERE name=? AND specialization=? AND is_active=1 ORDER BY doctor_id LIMIT 1',target);
        if(!doctor) return res.status(503).json({message:'Assigned doctor is not configured'});
        res.json(doctor);
    } catch(e) { res.status(500).json({message:'Unable to resolve assigned doctor'}); }
});

app.post('/api/doctors', async (req,res) => {
    try {
        const name=textValue(req.body?.name,'Name',100,true);
        const specialization=textValue(req.body?.specialization,'Specialization',100,true);
        const experience=integerValue(req.body?.experience,'Experience',0,60);
        const phone=textValue(req.body?.phone,'Phone',20,true);
        for(const result of [name,specialization,experience,phone]){
            if(result.error) return res.status(400).json({message:result.error});
        }
        if(name.value.length<2) return res.status(400).json({message:'Name must be at least 2 characters'});
        if(!/^[A-Za-z][A-Za-z .&'-]{1,99}$/.test(specialization.value)){
            return res.status(400).json({message:'Specialization must be 2 to 100 letters and may include spaces, periods, apostrophes, hyphens, or ampersands'});
        }
        if(!validPhone(phone.value)) return res.status(400).json({message:'Enter a valid phone number'});
        const [r] = await pool.query(
            'INSERT INTO doctors(name,specialization,experience,phone) VALUES(?,?,?,?)',
            [name.value,specialization.value,experience.value,phone.value]
        );
        res.status(201).json({message:'Doctor added', doctor_id:r.insertId});
    } catch(e) { res.status(500).json({message:'Unable to add doctor'}); }
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
    let connection;
    let lockHeld=false;
    let doctorId=null;
    try {
        const patientId=positiveId(req.body?.patient_id);
        doctorId=positiveId(req.body?.doctor_id);
        const date=req.body?.appointment_date;
        const time=req.body?.appointment_time;
        const reason=textValue(req.body?.reason,'Reason',255);
        const rawDuration=req.body?.duration_minutes ?? supportedDurations()[0];
        const duration=integerValue(rawDuration,'Appointment duration',5,480);
        if(!patientId) return res.status(400).json({message:'Enter a valid patient ID'});
        if(!doctorId) return res.status(400).json({message:'Enter a valid doctor ID'});
        if(!validDate(date)) return res.status(400).json({message:'Enter a valid appointment date'});
        const clock=localClock();
        if(date<clock.date) return res.status(400).json({message:'Appointment date cannot be in the past'});
        if(typeof time!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){
            return res.status(400).json({message:'Enter a valid appointment time'});
        }
        if(reason.error) return res.status(400).json({message:reason.error});
        if(duration.error) return res.status(400).json({message:duration.error});
        if(!supportedDurations().includes(duration.value)) return res.status(400).json({message:'Select a supported appointment duration'});
        if(date===clock.date && timeToMinutes(time)<clock.minutes) return res.status(400).json({message:'Appointment time cannot be in the past'});
        const [[patient]]=await pool.query('SELECT patient_id FROM patients WHERE patient_id=?',[patientId]);
        if(!patient) return res.status(404).json({message:'Patient not found'});
        const [[doctor]]=await pool.query('SELECT doctor_id FROM doctors WHERE doctor_id=? AND is_active=1',[doctorId]);
        if(!doctor) return res.status(404).json({message:'Doctor not found'});
        connection=await pool.getConnection();
        lockHeld=await doctorLock(connection,doctorId);
        if(!lockHeld) return res.status(409).json({message:'Scheduling is busy for this doctor. Please try again.'});
        await connection.beginTransaction();
        if(!await lockDoctorRow(connection,doctorId)){
            await connection.rollback();
            return res.status(404).json({message:'Doctor not found'});
        }
        const workingHours=await readDoctorSchedule(connection,doctorId);
        const appointments=await readDoctorAppointments(connection,doctorId,date,date);
        if(!isSlotAvailable({date,startTime:time,durationMinutes:duration.value,workingHours,appointments,doctorId})){
            await connection.rollback();
            return res.status(409).json({message:'The requested appointment time is outside working hours or overlaps an active appointment'});
        }
        const endTime=minutesToTime(timeToMinutes(time)+duration.value);
        const finalWorkingHours=await readDoctorSchedule(connection,doctorId);
        const finalAppointments=await readDoctorAppointments(connection,doctorId,date,date);
        if(!isSlotAvailable({date,startTime:time,durationMinutes:duration.value,workingHours:finalWorkingHours,appointments:finalAppointments,doctorId})){
            await connection.rollback();
            return res.status(409).json({message:'The requested appointment time is no longer available'});
        }
        const [appointment]=await connection.query(
            `INSERT INTO appointments(patient_id,doctor_id,appointment_date,appointment_time,appointment_end_time,duration_minutes,reason)
             VALUES(?,?,?,?,?,?,?)`,
            [patientId,doctorId,date,time,endTime,duration.value,reason.value || null]
        );
        await connection.commit();
        res.status(201).json({message:'Appointment booked',appointment_id:appointment.insertId,appointment_date:date,appointment_time:time,appointment_end_time:endTime,duration_minutes:duration.value});
    } catch(e) {
        if(connection) try { await connection.rollback(); } catch(_) {}
        res.status(500).json({message:'Unable to book appointment'});
    } finally {
        if(lockHeld) await releaseDoctorLock(connection,doctorId);
        if(connection) connection.release();
    }
});

app.put('/api/appointments/:id/cancel', async (req,res) => {
    try {
        const id=positiveId(req.params.id);
        if(!id) return res.status(400).json({message:'Enter a valid appointment ID'});
        const [result]=await pool.query("UPDATE appointments SET status='Cancelled' WHERE appointment_id=? AND status='Booked'",[id]);
        if(!result.affectedRows) return res.status(404).json({message:'Booked appointment not found'});
        res.json({message:'Appointment cancelled'});
    } catch(e) { res.status(500).json({message:'Unable to cancel appointment'}); }
});

app.get('/api/emergency', async (req,res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM emergency_cases ORDER BY priority ASC, created_at ASC');
        res.json(rows);
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/emergency', async (req,res) => {
    try {
        const patientName=textValue(req.body?.patient_name,'Patient name',100,true);
        const condition=textValue(req.body?.condition_name,'Condition',255);
        const priority=integerValue(req.body?.priority,'Priority',1,4);
        for(const result of [patientName,condition,priority]){
            if(result.error) return res.status(400).json({message:result.error});
        }
        await pool.query(
            'INSERT INTO emergency_cases(patient_name,condition_name,priority) VALUES(?,?,?)',
            [patientName.value,condition.value || null,priority.value]
        );
        res.status(201).json({message:'Emergency case added'});
    } catch(e) { res.status(500).json({message:'Unable to add emergency case'}); }
});

app.put('/api/emergency/:id/treat', async (req,res) => {
    try {
        const id=positiveId(req.params.id);
        if(!id) return res.status(400).json({message:'Enter a valid emergency case ID'});
        const [result]=await pool.query("UPDATE emergency_cases SET status='Treated' WHERE case_id=? AND status='Waiting'",[id]);
        if(!result.affectedRows) return res.status(404).json({message:'Waiting emergency case not found'});
        res.json({message:'Emergency case marked treated'});
    } catch(e) { res.status(500).json({message:'Unable to update emergency case'}); }
});

app.get('/api/beds', async (req,res) => {
    try { const [rows] = await pool.query('SELECT * FROM beds ORDER BY bed_id'); res.json(rows); }
    catch(e) { res.status(500).json({message:e.message}); }
});

app.put('/api/beds/:id/allocate', async (req,res) => {
    try {
        const bedId=positiveId(req.params.id);
        const patientId=positiveId(req.body?.patient_id);
        if(!bedId) return res.status(400).json({message:'Enter a valid bed ID'});
        if(!patientId){
            return res.status(400).json({message:'Enter a valid patient ID'});
        }
        const [[patient]]=await pool.query('SELECT patient_id FROM patients WHERE patient_id=?',[patientId]);
        if(!patient) return res.status(404).json({message:'Patient not found'});
        const [[bed]]=await pool.query('SELECT bed_id FROM beds WHERE bed_id=?',[bedId]);
        if(!bed) return res.status(404).json({message:'Bed not found'});
        const [existingAssignment]=await pool.query(
            "SELECT bed_id FROM beds WHERE patient_id=? AND status='Occupied'",
            [patientId]
        );
        if(existingAssignment.length) return res.status(409).json({message:'Patient already has an occupied bed'});
        const [r] = await pool.query(
            "UPDATE beds SET status='Occupied', patient_id=? WHERE bed_id=? AND status='Available'",
            [patientId,bedId]
        );
        if (!r.affectedRows) return res.status(409).json({message:'Bed is not available'});
        res.json({message:'Bed allocated'});
    } catch(e) { res.status(500).json({message:'Unable to allocate bed'}); }
});

app.put('/api/beds/:id/release', async (req,res) => {
    try {
        const id=positiveId(req.params.id);
        if(!id) return res.status(400).json({message:'Enter a valid bed ID'});
        const [result]=await pool.query("UPDATE beds SET status='Available', patient_id=NULL WHERE bed_id=? AND status='Occupied'",[id]);
        if(!result.affectedRows) return res.status(404).json({message:'Occupied bed not found'});
        res.json({message:'Bed released'});
    } catch(e) { res.status(500).json({message:'Unable to release bed'}); }
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

ensurePredefinedDoctors().then(() => {
    app.listen(process.env.PORT || 3000, () => {
        console.log(`CareSphere server running on http://localhost:${process.env.PORT || 3000}`);
    });
}).catch(error => {
    console.error('Unable to initialize predefined doctors:',error.message);
    process.exit(1);
});

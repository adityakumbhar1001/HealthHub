const test = require('node:test');
const assert = require('node:assert/strict');
const { findEarliestSlot, isSlotAvailable, supportedDurations, intervalsOverlap, summarizeDoctorDay, timeToMinutes } = require('../scheduler');

const hours = [2, 3, 4, 5, 6].map(day_of_week => ({ day_of_week, start_time: '09:00:00', end_time: '13:00:00', is_active: 1 }));
const booking = (time, end, status = 'Booked', doctor_id = 1) => ({ appointment_date: '2026-10-26', appointment_time: `${time}:00`, appointment_end_time: end ? `${end}:00` : null, duration_minutes: end ? 30 : null, status, doctor_id });
const schedule = (durationMinutes, appointments = [], nowMinutes = 9 * 60) => findEarliestSlot({ startDate: '2026-10-26', horizonDays: 10, durationMinutes, workingHours: hours, appointments, nowMinutes });

test('30 minutes fits a 30-minute gap', () => {
    const slot = schedule(30, [booking('09:00', '09:30'), booking('10:00', '11:00'), booking('12:00', '12:30')]);
    assert.deepEqual(slot, { appointment_date: '2026-10-26', appointment_time: '09:30:00', appointment_end_time: '10:00:00' });
});

test('one hour does not fit a 30-minute gap', () => {
    const slot = schedule(60, [booking('09:00', '09:30'), booking('10:00', '11:00')]);
    assert.equal(slot.appointment_time, '11:00:00');
});

test('longer appointment fits a sufficiently large interval', () => {
    const slot = schedule(90, [booking('09:00', '09:30'), booking('11:00', '12:00')]);
    assert.deepEqual([slot.appointment_time, slot.appointment_end_time], ['09:30:00', '11:00:00']);
});

test('appointments may start when another ends (half-open intervals)', () => {
    assert.equal(isSlotAvailable({ date: '2026-10-26', startTime: '09:30:00', durationMinutes: 30, workingHours: hours, appointments: [booking('09:00', '09:30')] }), true);
});

test('back-to-back appointments do not overlap', () => {
    assert.equal(intervalsOverlap(570,600,540,570),false);
});

test('exact overlap is rejected', () => {
    assert.equal(isSlotAvailable({date:'2026-10-26',startTime:'09:15:00',durationMinutes:30,workingHours:hours,appointments:[booking('09:00','09:30')],doctorId:1}),false);
});

test('an appointment contained within an existing appointment is rejected', () => {
    const existing={...booking('09:00','10:00'),duration_minutes:60};
    assert.equal(isSlotAvailable({date:'2026-10-26',startTime:'09:15:00',durationMinutes:15,workingHours:hours,appointments:[existing],doctorId:1}),false);
});

test('same time for a different doctor remains available', () => {
    assert.equal(isSlotAvailable({date:'2026-10-26',startTime:'09:00:00',durationMinutes:30,workingHours:hours,appointments:[booking('09:00','09:30','Booked',1)],doctorId:2}),true);
});

test('cancelled appointments do not occupy a slot', () => {
    assert.equal(schedule(30, [booking('09:00', '10:00', 'Cancelled')]).appointment_time, '09:00:00');
});

test('legacy active appointments with unknown ends conservatively block the rest of the day', () => {
    assert.equal(schedule(30,[booking('09:00',null)],9*60).appointment_date,'2026-10-27');
});

test('schedule summary subtracts active bookings from working hours only', () => {
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:hours.filter(row=>row.day_of_week===2),appointments:[booking('09:00','09:30'),booking('10:00','11:00','Cancelled')]});
    assert.equal(summary.booked_duration_minutes,30);
    assert.equal(summary.remaining_free_minutes,210);
    assert.deepEqual(summary.free_intervals.map(interval=>[interval.start_time,interval.end_time]),[['09:30:00','13:00:00']]);
});

test('selected-date appointment contributes to count, recorded duration, and free time',()=>{
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:hours.filter(row=>row.day_of_week===2),appointments:[{
        ...booking('09:00','10:00'),duration_minutes:60
    }]});
    assert.equal(summary.booked_appointment_count,1);
    assert.equal(summary.booked_duration_minutes,60);
    assert.equal(summary.remaining_free_minutes,180);
    assert.deepEqual(summary.free_intervals.map(({start_time,end_time})=>[start_time,end_time]),[['10:00:00','13:00:00']]);
});

test('appointment on another date is excluded from selected-date metrics',()=>{
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:hours.filter(row=>row.day_of_week===2),appointments:[
        booking('09:00','09:30'),{...booking('10:00','10:30'),appointment_date:'2026-10-27'}
    ]});
    assert.equal(summary.booked_appointment_count,1);
    assert.equal(summary.booked_duration_minutes,30);
    assert.equal(summary.remaining_free_minutes,210);
    assert.equal(summary.appointments.length,1);
});

test('cancelled appointments do not count or block the selected date',()=>{
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:hours.filter(row=>row.day_of_week===2),appointments:[booking('09:00','10:00','Cancelled')]});
    assert.equal(summary.booked_appointment_count,0);
    assert.equal(summary.booked_duration_minutes,0);
    assert.equal(summary.remaining_free_minutes,240);
    assert.deepEqual(summary.free_intervals.map(({start_time,end_time})=>[start_time,end_time]),[['09:00:00','13:00:00']]);
});

test('unknown duration with no end time blocks the rest of that working day but is not counted as recorded duration',()=>{
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:hours.filter(row=>row.day_of_week===2),appointments:[booking('10:00',null)]});
    assert.equal(summary.booked_appointment_count,1);
    assert.equal(summary.booked_duration_minutes,0);
    assert.equal(summary.unknown_duration_appointment_count,1);
    assert.equal(summary.appointments[0].end_time,null);
    assert.equal(summary.remaining_free_minutes,60);
    assert.deepEqual(summary.free_intervals.map(({start_time,end_time})=>[start_time,end_time]),[['09:00:00','10:00:00']]);
});

test('unknown duration with stored end time blocks that interval without inventing a recorded duration',()=>{
    const appointment={...booking('09:00','10:00'),duration_minutes:null};
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:hours.filter(row=>row.day_of_week===2),appointments:[appointment]});
    assert.equal(summary.booked_duration_minutes,0);
    assert.equal(summary.unknown_duration_appointment_count,1);
    assert.equal(summary.remaining_free_minutes,180);
    assert.deepEqual(summary.free_intervals.map(({start_time,end_time})=>[start_time,end_time]),[['10:00:00','13:00:00']]);
});

test('missing working hours never report available free time', () => {
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:[],appointments:[]});
    assert.equal(summary.working_hours_configured,false);
    assert.equal(summary.total_working_minutes,0);
    assert.equal(summary.remaining_free_minutes,0);
    assert.deepEqual(summary.free_intervals,[]);
});

test('09:00–13:00 working day with no appointments exposes four free hours',()=>{
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:hours.filter(row=>row.day_of_week===2),appointments:[]});
    assert.equal(summary.working_hours_configured,true);
    assert.equal(summary.total_working_minutes,240);
    assert.equal(summary.booked_appointment_count,0);
    assert.equal(summary.booked_duration_minutes,0);
    assert.equal(summary.remaining_free_minutes,240);
    assert.deepEqual(summary.working_intervals.map(({start_time,end_time})=>[start_time,end_time]),[['09:00:00','13:00:00']]);
    assert.deepEqual(summary.free_intervals.map(({start_time,end_time})=>[start_time,end_time]),[['09:00:00','13:00:00']]);
});

test('partial and back-to-back bookings produce matching free intervals and totals',()=>{
    const dayHours=hours.filter(row=>row.day_of_week===2);
    const summary=summarizeDoctorDay({date:'2026-10-26',workingHours:dayHours,appointments:[
        booking('09:00','09:30'),booking('09:30','10:00'),{...booking('11:00','12:00'),duration_minutes:60}
    ]});
    assert.equal(summary.booked_appointment_count,3);
    assert.equal(summary.booked_duration_minutes,120);
    assert.deepEqual(summary.free_intervals.map(({start_time,end_time,duration_minutes})=>[start_time,end_time,duration_minutes]),[
        ['10:00:00','11:00:00',60],['12:00:00','13:00:00',60]
    ]);
    assert.equal(summary.remaining_free_minutes,summary.free_intervals.reduce((total,interval)=>total+interval.duration_minutes,0));
    assert.equal(summary.remaining_free_minutes,summary.total_working_minutes-summary.booked_duration_minutes);
});

test('scheduler moves to the next configured workday when today is full', () => {
    const allDay = [booking('09:00', '13:00')];
    assert.deepEqual(schedule(30, allDay), { appointment_date: '2026-10-27', appointment_time: '09:00:00', appointment_end_time: '09:30:00' });
});

test('unsupported durations are rejected by configured options', () => {
    assert.deepEqual(supportedDurations('30,60,90'), [30, 60, 90]);
    assert.throws(() => supportedDurations('30,999'), /5 to 480/);
});

test('no available slot returns null within the horizon', () => {
    const noHours = hours.map(row => ({ ...row, start_time: '09:00:00', end_time: '09:15:00' }));
    assert.equal(findEarliestSlot({ startDate: '2026-10-26', horizonDays: 10, durationMinutes: 30, workingHours: noHours, appointments: [], nowMinutes: 9 * 60 }), null);
});

if(process.env.CARESPHERE_RUN_DB_TESTS==='1'){
    const test=require('node:test');
    const pool=require('../db');
    const {summarizeDoctorDay}=require('../scheduler');
    const api=(process.env.CARESPHERE_API_URL||'http://localhost:3000/api').replace(/\/$/,'');
    test.after(()=>pool.end());

    test('requested doctors are inactive while every other doctor remains available',async()=>{
        const [targetRows]=await pool.query(`SELECT d.doctor_id,d.name,d.specialization,d.is_active,COUNT(a.appointment_id) AS historical_appointments
            FROM doctors d LEFT JOIN appointments a ON a.doctor_id=d.doctor_id
            WHERE (d.name='Ak' AND d.specialization='Eyes')
               OR (d.name='Derw' AND (d.specialization IS NULL OR TRIM(d.specialization)=''))
               OR (d.name='Dr. Amit Kulkarni' AND d.specialization='Cardiology')
            GROUP BY d.doctor_id,d.name,d.specialization,d.is_active`);
        assert.equal(targetRows.length,3,'all three requested doctor records must still exist');
        assert.ok(targetRows.every(doctor=>Number(doctor.is_active)===0),'requested doctors must be soft-deactivated');
        assert.ok(Number(targetRows.find(doctor=>doctor.name==='Ak').historical_appointments)>0,'Ak historical appointment must remain linked');

        const [activeRows]=await pool.query('SELECT doctor_id FROM doctors WHERE is_active=1 ORDER BY doctor_id');
        const doctorsResponse=await fetch(api+'/doctors');
        const doctors=await doctorsResponse.json();
        assert.equal(doctorsResponse.status,200);
        assert.deepEqual(doctors.map(doctor=>doctor.doctor_id).sort((a,b)=>a-b),activeRows.map(row=>row.doctor_id));
        assert.ok(doctors.every(doctor=>!targetRows.some(target=>target.doctor_id===doctor.doctor_id)));

        const scheduleResponse=await fetch(api+'/doctors/schedule');
        const schedule=await scheduleResponse.json();
        assert.equal(scheduleResponse.status,200);
        assert.deepEqual(schedule.doctors.map(doctor=>doctor.doctor_id).sort((a,b)=>a-b),activeRows.map(row=>row.doctor_id));

        const patientMarker=`CS inactive doctor check ${Date.now()} ${Math.random()}`;
        const [patientInsert]=await pool.query('INSERT INTO patients(name,age,gender,blood_group,disease,phone) VALUES(?,?,?,?,?,?)',[
            patientMarker,35,'Other','O+','Fever / Common Cold','9876543210'
        ]);
        try{
            const inactiveBooking=await fetch(api+'/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                patient_id:patientInsert.insertId,
                doctor_id:targetRows.find(doctor=>doctor.name==='Ak').doctor_id,
                appointment_date:'2099-01-02',appointment_time:'09:00',duration_minutes:30,reason:'Inactive doctor test'
            })});
            assert.equal(inactiveBooking.status,404,'manual appointment creation must reject an inactive doctor');
            const [[bookings]]=await pool.query('SELECT COUNT(*) AS total FROM appointments WHERE patient_id=?',[patientInsert.insertId]);
            assert.equal(Number(bookings.total),0);
        }finally{
            await pool.query('DELETE FROM patients WHERE patient_id=?',[patientInsert.insertId]);
        }

        for(const disease of ['Fever / Common Cold','Heart-related condition','Skin condition','Bone / Joint problem',"Children's health condition",'Brain / Nervous system condition','Other / General illness']){
            const assignmentResponse=await fetch(api+`/doctor-assignment/${encodeURIComponent(disease)}`);
            if(assignmentResponse.status===200){
                const assignment=await assignmentResponse.json();
                assert.ok(activeRows.some(row=>row.doctor_id===assignment.doctor_id),`${disease} assigned to an inactive doctor`);
            }else assert.equal(assignmentResponse.status,503,`${disease} assignment should be unavailable if its configured doctor is inactive`);
        }
    });

    test('doctor schedule API matches database counts and omits patient data',async()=>{
        const response=await fetch(api+'/doctors/schedule');
        const data=await response.json();
        assert.equal(response.status,200);
        const zone=process.env.APPOINTMENT_TIME_ZONE||'Asia/Kolkata';
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
        assert.equal(data.date,`${values.year}-${values.month}-${values.day}`);
        const [hours]=await pool.query('SELECT doctor_id,start_time,end_time FROM doctor_working_hours WHERE is_active=1 AND day_of_week=DAYOFWEEK(?)',[data.date]);
        const [appointments]=await pool.query('SELECT appointment_id,doctor_id,appointment_date,appointment_time,appointment_end_time,duration_minutes,status FROM appointments WHERE appointment_date=?',[data.date]);
        const [counts]=await pool.query("SELECT doctor_id,COUNT(*) AS total FROM appointments WHERE status='Booked' AND appointment_date>=? GROUP BY doctor_id",[data.date]);
        const future=new Map(counts.map(row=>[row.doctor_id,Number(row.total)]));
        for(const doctor of data.doctors){
            const summary=summarizeDoctorDay({date:data.date,workingHours:hours.filter(row=>row.doctor_id===doctor.doctor_id),appointments:appointments.filter(row=>row.doctor_id===doctor.doctor_id)});
            assert.equal(doctor.selected_date_appointment_count,summary.booked_appointment_count);
            assert.equal(doctor.active_future_appointment_count,future.get(doctor.doctor_id)||0);
            assert.equal(doctor.booked_duration_minutes,summary.booked_duration_minutes);
            assert.deepEqual(doctor.working_intervals,summary.working_intervals);
            assert.equal(doctor.remaining_free_minutes,summary.remaining_free_minutes);
            assert.equal(doctor.remaining_free_minutes,doctor.free_intervals.reduce((total,interval)=>total+interval.duration_minutes,0));
            assert.ok(!('patient_name' in doctor));
            assert.ok(doctor.appointments.every(appointment=>!('patient_id' in appointment)&&!('patient_name' in appointment)));
        }
    });

    test('schedule API rejects malformed dates with JSON',async()=>{
        const response=await fetch(api+'/doctors/schedule?date=not-a-date');
        const body=await response.json();
        assert.equal(response.status,400);
        assert.match(body.message,/valid schedule date/);
    });

    test('InnoDB rolls back patient insertion after a failed appointment insert',async()=>{
        const connection=await pool.getConnection();
        const marker=`CS rollback check ${Date.now()} ${Math.random()}`;
        let active=false;
        let patientId=null;
        try{
            await connection.beginTransaction();active=true;
            const [patient]=await connection.query('INSERT INTO patients(name,age,gender,blood_group,disease,phone) VALUES(?,?,?,?,?,?)',[marker,40,'Other','O+','Fever / Common Cold','9876543210']);
            patientId=patient.insertId;
            await assert.rejects(connection.query(
                "INSERT INTO appointments(patient_id,doctor_id,appointment_date,appointment_time,appointment_end_time,duration_minutes,reason,status) VALUES(?, -2147483648, CURRENT_DATE, '09:00:00', '09:30:00', 30, 'rollback test', 'Booked')",
                [patientId]
            ),error=>error.code==='ER_NO_REFERENCED_ROW_2');
            await connection.rollback();active=false;
            const [[remaining]]=await pool.query('SELECT COUNT(*) AS total FROM patients WHERE patient_id=?',[patientId]);
            assert.equal(Number(remaining.total),0);
        }finally{
            if(active) await connection.rollback();
            connection.release();
        }
    });

    test('patient registration endpoint rolls back when appointment insertion fails',async()=>{
        const trigger='caresphere_test_fail_booking_trigger';
        const [[existing]]=await pool.query('SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?',[trigger]);
        assert.equal(Number(existing.total),0,'temporary test trigger name must be unused');
        const marker=`CS rollback API ${Date.now()} ${Math.random().toString(16).slice(2)}`;
        let triggerCreated=false;
        try{
            await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON appointments FOR EACH ROW
                BEGIN
                    DECLARE probe_name VARCHAR(100);
                    SELECT name INTO probe_name FROM patients WHERE patient_id=NEW.patient_id;
                    IF probe_name LIKE 'CS rollback API %' THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Test appointment insert failure';
                    END IF;
                END`);
            triggerCreated=true;
            const response=await fetch(api+'/patients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                name:marker,age:33,gender:'Other',blood_group:'O+',disease:'Fever / Common Cold',phone:'9876543210',duration_minutes:30
            })});
            const result=await response.json();
            assert.equal(response.status,500,result.message);
            const [[remaining]]=await pool.query('SELECT COUNT(*) AS total FROM patients WHERE name=?',[marker]);
            assert.equal(Number(remaining.total),0);
        }finally{
            if(triggerCreated) await pool.query(`DROP TRIGGER IF EXISTS ${trigger}`);
            await pool.query('DELETE FROM patients WHERE name=?',[marker]);
        }
    });

    test('simultaneous registrations for the same doctor commit non-overlapping appointments',async()=>{
        const suffix=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const payloads=[0,1].map(index=>({name:`CS concurrent ${suffix} ${index}`,age:30+index,gender:'Other',blood_group:'O+',disease:'Fever / Common Cold',phone:`98765432${String(20+index).padStart(2,'0')}`,duration_minutes:30}));
        const created=[];
        try{
            const responses=await Promise.all(payloads.map(body=>fetch(api+'/patients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})));
            const results=await Promise.all(responses.map(response=>response.json()));
            for(const result of results) if(result.patient_id) created.push(result.patient_id);
            assert.deepEqual(responses.map(response=>response.status),[201,201],JSON.stringify(results.map(result=>result.message)));
            assert.equal(results[0].doctor.doctor_id,results[1].doctor.doctor_id);
            const a=results[0],b=results[1];
            const overlap=a.appointment_date===b.appointment_date
                && intervalsOverlap(timeToMinutes(a.appointment_time),timeToMinutes(a.appointment_end_time),timeToMinutes(b.appointment_time),timeToMinutes(b.appointment_end_time));
            assert.equal(overlap,false);
            const manualConflict=await fetch(api+'/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                patient_id:a.patient_id,doctor_id:a.doctor.doctor_id,appointment_date:a.appointment_date,appointment_time:a.appointment_time.slice(0,5),duration_minutes:30,reason:'Overlap prevention test'
            })});
            assert.equal(manualConflict.status,409,'manual appointment endpoint must reject an occupied slot');
        }finally{
            await Promise.all(created.map(patientId=>fetch(api+`/patients/${patientId}`,{method:'DELETE'})));
        }
    });
}

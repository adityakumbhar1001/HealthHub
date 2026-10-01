const API = 'http://localhost:3000/api';

async function request(url, options={}) {
    const res = await fetch(API + url, {
        headers:{'Content-Type':'application/json'},
        ...options
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
}

function message(text){ const el=document.getElementById('message'); if(el) el.textContent=text; }

async function login(e){
    e.preventDefault();
    try{
        const data=await request('/login',{method:'POST',body:JSON.stringify({
            username:document.getElementById('username').value,
            password:document.getElementById('password').value
        })});
        localStorage.setItem('user',JSON.stringify(data));
        location.href='dashboard.html';
    }catch(err){message(err.message);}
}
function logout(){localStorage.removeItem('user');location.href='index.html';}

async function loadDashboard(){
    try{
        const d=await request('/dashboard');
        document.getElementById('patients').textContent=d.patients;
        document.getElementById('doctors').textContent=d.doctors;
        document.getElementById('appointments').textContent=d.appointments;
        document.getElementById('beds').textContent=d.beds;
    }catch(e){message(e.message);}
}

async function loadPatients(){
    const rows=await request('/patients');
    document.getElementById('patientTable').innerHTML=rows.map(p=>`
    <tr><td>${p.patient_id}</td><td>${p.name}</td><td>${p.age}</td><td>${p.gender||''}</td>
    <td>${p.blood_group||''}</td><td>${p.disease||''}</td><td>${p.phone||''}</td></tr>`).join('');
}
async function addPatient(e){
    e.preventDefault();
    try{
        await request('/patients',{method:'POST',body:JSON.stringify({
            name:pname.value,age:page.value,gender:pgender.value,blood_group:pblood.value,disease:pdisease.value,phone:pphone.value
        })});
        message('Patient added successfully'); e.target.reset(); loadPatients();
    }catch(err){message(err.message);}
}

async function loadDoctors(){
    const rows=await request('/doctors');
    doctorTable.innerHTML=rows.map(d=>`<tr><td>${d.doctor_id}</td><td>${d.name}</td><td>${d.specialization||''}</td><td>${d.experience}</td><td>${d.phone||''}</td></tr>`).join('');
}
async function addDoctor(e){
    e.preventDefault();
    try{
        await request('/doctors',{method:'POST',body:JSON.stringify({
            name:dname.value,specialization:dspecialization.value,experience:dexperience.value,phone:dphone.value
        })});
        message('Doctor added successfully');e.target.reset();loadDoctors();
    }catch(err){message(err.message);}
}

async function loadAppointments(){
    const rows=await request('/appointments');
    appointmentTable.innerHTML=rows.map(a=>`<tr><td>${a.appointment_id}</td><td>${a.patient_name}</td><td>${a.doctor_name}</td><td>${a.appointment_date}</td><td>${a.appointment_time}</td><td>${a.status}</td><td>${a.status==='Booked'?`<button onclick="cancelAppointment(${a.appointment_id})">Cancel</button>`:''}</td></tr>`).join('');
}
async function addAppointment(e){
    e.preventDefault();
    try{
        await request('/appointments',{method:'POST',body:JSON.stringify({
            patient_id:apatient.value,doctor_id:adoctor.value,appointment_date:adate.value,appointment_time:atime.value,reason:areason.value
        })});
        message('Appointment booked');e.target.reset();loadAppointments();
    }catch(err){message(err.message);}
}
async function cancelAppointment(id){try{await request('/appointments/'+id+'/cancel',{method:'PUT'});loadAppointments();}catch(e){message(e.message);}}

async function loadEmergency(){
    const rows=await request('/emergency');
    emergencyTable.innerHTML=rows.map(x=>`<tr><td>${x.case_id}</td><td>${x.patient_name}</td><td>${x.condition_name||''}</td><td>${x.priority}</td><td>${x.status}</td><td>${x.status==='Waiting'?`<button onclick="treatEmergency(${x.case_id})">Treat</button>`:''}</td></tr>`).join('');
}
async function addEmergency(e){
    e.preventDefault();
    try{await request('/emergency',{method:'POST',body:JSON.stringify({patient_name:ename.value,condition_name:econdition.value,priority:Number(epriority.value)})});message('Emergency case added');e.target.reset();loadEmergency();}
    catch(err){message(err.message);}
}
async function treatEmergency(id){try{await request('/emergency/'+id+'/treat',{method:'PUT'});loadEmergency();}catch(e){message(e.message);}}

let selectedBed=null;
async function loadBeds(){
    const rows=await request('/beds');
    bedTable.innerHTML=rows.map(b=>`<tr><td>${b.bed_id}</td><td>${b.room_no}</td><td>${b.ward}</td><td>${b.status}</td><td>${b.patient_id||'-'}</td><td>${b.status==='Available'?`<button onclick="selectedBed=${b.bed_id};allocateBed()">Allocate</button>`:`<button onclick="releaseBed(${b.bed_id})">Release</button>`}</td></tr>`).join('');
}
async function allocateBed(){
    const pid=document.getElementById('bedPatient').value;
    if(!selectedBed){message('Click Allocate for a bed first');return;}
    if(!Number.isSafeInteger(Number(pid))||Number(pid)<=0){message('Enter a valid patient ID');return;}
    try{await request('/beds/'+selectedBed+'/allocate',{method:'PUT',body:JSON.stringify({patient_id:pid})});message('Bed allocated');selectedBed=null;loadBeds();}
    catch(e){message(e.message);}
}
async function releaseBed(id){try{await request('/beds/'+id+'/release',{method:'PUT'});loadBeds();}catch(e){message(e.message);}}

async function loadMedicines(){
    const rows=await request('/medicines');
    medicineTable.innerHTML=rows.map(m=>`<tr><td>${m.medicine_id}</td><td>${m.name}</td><td>${m.quantity}</td><td>₹${m.price}</td><td>${m.expiry_date||''}</td><td>${m.quantity<10?'LOW STOCK':'OK'}</td></tr>`).join('');
}
async function addMedicine(e){
    e.preventDefault();
    try{await request('/medicines',{method:'POST',body:JSON.stringify({name:mname.value,quantity:Number(mquantity.value),price:Number(mprice.value),expiry_date:mexpiry.value||null})});message('Medicine added');e.target.reset();loadMedicines();}
    catch(err){message(err.message);}
}

async function loadLabs(){
    const rows=await request('/labs');
    labTable.innerHTML=rows.map(l=>`<tr><td>${l.test_id}</td><td>${l.patient_name}</td><td>${l.test_name}</td><td>${l.result||''}</td><td>${l.test_date}</td><td>${l.status}</td></tr>`).join('');
}
async function addLab(e){
    e.preventDefault();
    try{await request('/labs',{method:'POST',body:JSON.stringify({patient_id:lpatient.value,test_name:ltest.value,result:lresult.value,status:lstatus.value})});message('Lab test added');e.target.reset();loadLabs();}
    catch(err){message(err.message);}
}

async function loadBills(){
    const rows=await request('/bills');
    billTable.innerHTML=rows.map(b=>`<tr><td>${b.bill_id}</td><td>${b.patient_name}</td><td>₹${b.consultation_fee}</td><td>₹${b.medicine_fee}</td><td>₹${b.lab_fee}</td><td>₹${b.total}</td><td>${b.bill_date}</td></tr>`).join('');
}
async function addBill(e){
    e.preventDefault();
    try{
        const d=await request('/bills',{method:'POST',body:JSON.stringify({patient_id:bpatient.value,consultation_fee:bconsult.value,medicine_fee:bmedicine.value,lab_fee:blab.value})});
        message('Bill generated. Total = ₹'+d.total);e.target.reset();loadBills();
    }catch(err){message(err.message);}
}

const API = (window.CARESPHERE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/,'');

async function request(url, options={}) {
    let res;
    try{
        res=await fetch(API+url,{headers:{'Content-Type':'application/json'},...options});
    }catch(_){
        throw new Error(`Cannot reach the CareSphere API at ${API}. Make sure the backend is running.`);
    }
    const contentType=res.headers.get('content-type')||'';
    const isJson=/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType);
    if(!res.ok){
        if(!isJson) throw new Error(`API request failed with HTTP ${res.status} at ${API+url}; the server returned ${contentType||'a non-JSON response'}. Verify the backend route and port.`);
        let errorData;
        try{errorData=await res.json();}catch(_){throw new Error(`API request failed with HTTP ${res.status} and returned invalid JSON.`);}
        throw new Error(errorData?.message||`API request failed with HTTP ${res.status} at ${API+url}.`);
    }
    if(!isJson){
        throw new Error(`Expected JSON from ${API+url}, but received ${contentType||'an unknown content type'} (HTTP ${res.status}). Make sure the CareSphere backend is running on port 3000.`);
    }
    try{return await res.json();}
    catch(_){throw new Error(`The API at ${API+url} returned invalid JSON.`);}
}

function message(text){ const el=document.getElementById('message'); if(el) el.textContent=text; }

function notifyAppointmentsChanged(){
    try{localStorage.setItem('caresphere-appointments-updated',String(Date.now()));}catch(_){}
}

function setFieldError(field, text){
    const error=document.querySelector(`[data-error-for="${field.id}"]`);
    field.setAttribute('aria-invalid',text ? 'true' : 'false');
    field.classList.toggle('invalid-field',Boolean(text));
    if(error) error.textContent=text;
}

function validateField(field, trimValue=false){
    if(trimValue && field.dataset.trim !== undefined) field.value=field.value.trim();
    field.setCustomValidity('');
    const value=field.value.trim();
    if(field.required && !value) field.setCustomValidity('This field is required.');
    else if(value && field.id==='pname' && value.length<2) field.setCustomValidity('Enter at least 2 characters.');
    else if(value && field.id==='dname' && value.length<2) field.setCustomValidity('Enter at least 2 characters.');
    else if(value && field.id==='dspecialization' && !/^[A-Za-z][A-Za-z .&'-]{1,99}$/.test(value)) field.setCustomValidity('Enter 2-100 letters; spaces, periods, apostrophes, hyphens, and ampersands are allowed.');
    else if(value && field.type==='tel' && !/^\+?[0-9][0-9 ()-]{6,18}[0-9]$/.test(value)) field.setCustomValidity('Enter a valid phone number.');
    else if(value && field.type==='tel' && (value.match(/[0-9]/g)||[]).length<8) field.setCustomValidity('Enter at least 8 digits.');
    else if(value && field.type==='tel' && (value.match(/[0-9]/g)||[]).length>15) field.setCustomValidity('Enter no more than 15 digits.');
    const valid=field.checkValidity();
    setFieldError(field,valid ? '' : field.validationMessage);
    return valid;
}

function validateForm(form){
    let valid=true;
    let firstInvalid=null;
    for(const field of form.querySelectorAll('input,select,textarea')){
        if(!validateField(field,true)){
            valid=false;
            firstInvalid ||= field;
        }
    }
    if(firstInvalid) firstInvalid.focus();
    return valid;
}

function bindValidation(form){
    if(!form) return;
    for(const field of form.querySelectorAll('input,select,textarea')){
        field.addEventListener('input',()=>validateField(field));
        field.addEventListener('change',()=>validateField(field));
    }
}

function beginFormSubmission(event){
    event.preventDefault();
    const form=event.currentTarget;
    if(form.dataset.submitting==='true' || !validateForm(form)) return null;
    form.dataset.submitting='true';
    for(const button of form.querySelectorAll('button[type="submit"],button:not([type])')) button.disabled=true;
    message('');
    return form;
}

function finishFormSubmission(form){
    form.dataset.submitting='false';
    for(const button of form.querySelectorAll('button[type="submit"],button:not([type])')) button.disabled=false;
}

function formatDate(value){
    if(!value) return '';
    const date=String(value).slice(0,10);
    const match=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value);
}

function formatTime(value){
    return value ? String(value).slice(0,5) : '';
}

function formatDuration(minutes){
    const value=Number(minutes);
    if(!Number.isInteger(value)||value<1) return '';
    const hours=Math.floor(value/60);
    const remainder=value%60;
    const parts=[];
    if(hours) parts.push(`${hours} ${hours===1?'hour':'hours'}`);
    if(remainder) parts.push(`${remainder} ${remainder===1?'minute':'minutes'}`);
    return parts.join(' ');
}

function formatAppointmentInterval(appointment){
    const start=formatTime(appointment.appointment_time);
    const end=formatTime(appointment.appointment_end_time);
    const duration=formatDuration(appointment.duration_minutes);
    return end&&duration ? `${start} to ${end} (${duration})` : `${start} (duration not recorded)`;
}

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

    const appointmentsBody=document.getElementById('dashboard-appointments');
    if(!appointmentsBody) return;
    try{
        const rows=await request('/appointments');
        const recent=rows.slice().sort((a,b)=>{
            const aDate=`${String(a.appointment_date||'').slice(0,10)}T${formatTime(a.appointment_time)||'00:00'}`;
            const bDate=`${String(b.appointment_date||'').slice(0,10)}T${formatTime(b.appointment_time)||'00:00'}`;
            return bDate.localeCompare(aDate);
        }).slice(0,5);
        appointmentsBody.replaceChildren();
        if(!recent.length){
            renderDashboardAppointmentMessage(appointmentsBody,'No appointments are available.');
            return;
        }
        for(const appointment of recent){
            const row=document.createElement('tr');
            const values=[
                appointment.patient_name||'',
                appointment.doctor_name||'',
                `${formatDate(appointment.appointment_date)} | ${formatAppointmentInterval(appointment)}`
            ];
            for(const value of values){
                const cell=document.createElement('td');
                cell.textContent=value;
                row.appendChild(cell);
            }
            const statusCell=document.createElement('td');
            const status=document.createElement('span');
            status.className=`dashboard-appointment-status${appointment.status==='Cancelled'?' is-cancelled':''}`;
            status.textContent=appointment.status||'Unknown';
            statusCell.appendChild(status);
            row.appendChild(statusCell);
            appointmentsBody.appendChild(row);
        }
    }catch(e){
        renderDashboardAppointmentMessage(appointmentsBody,'Unable to load appointments.');
        message(e.message);
    }
}

function renderDashboardAppointmentMessage(tbody,text){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='dashboard-table-message';
    cell.colSpan=4;
    cell.textContent=text;
    row.appendChild(cell);
    tbody.replaceChildren(row);
}

let patientRecords=[];
async function loadPatients(){
    patientRecords=await request('/patients');
    renderPatients();
}
function renderPatients(){
    const tableBody=document.getElementById('patientTable');
    if(!tableBody) return;
    const search=(document.getElementById('patientSearch')?.value||'').trim().toLowerCase();
    const gender=document.getElementById('patientGenderFilter')?.value||'';
    const rows=patientRecords.filter(patient=>{
        const searchable=[patient.patient_id,patient.name,patient.age,patient.gender,patient.blood_group,patient.disease,patient.phone]
            .map(value=>String(value??'').toLowerCase());
        return (!search||searchable.some(value=>value.includes(search)))&&(!gender||patient.gender===gender);
    });
    const count=document.getElementById('patientCount');
    if(count) count.textContent=`${rows.length} ${rows.length===1?'patient':'patients'}`;
    tableBody.replaceChildren();
    if(!rows.length){
        const row=document.createElement('tr');
        const cell=document.createElement('td');
        cell.className='patients-empty-row';
        cell.colSpan=7;
        cell.textContent=patientRecords.length?'No patients match your search.':'No patient records found.';
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }
    for(const patient of rows){
        const row=document.createElement('tr');
        for(const value of [patient.patient_id,patient.name,patient.age,patient.gender,patient.blood_group,patient.disease,patient.phone]){
            const cell=document.createElement('td');
            cell.textContent=value===null||value===undefined||value===''?'—':String(value);
            row.appendChild(cell);
        }
        tableBody.appendChild(row);
    }
}
async function addPatient(e){
    const form=beginFormSubmission(e);
    if(!form) return;
    try{
        const saved=await request('/patients',{method:'POST',body:JSON.stringify({
            name:pname.value,age:Number(page.value),gender:pgender.value,blood_group:pblood.value,disease:pdisease.value,phone:pphone.value,
            duration_minutes:Number(document.getElementById('pduration').value)
        })});
        form.reset();
        for(const field of form.querySelectorAll('input,select,textarea')) setFieldError(field,'');
        document.getElementById('assignedDoctor').value='Choose a disease category';
        notifyAppointmentsChanged();
        message(`Patient registered successfully. Appointment scheduled with ${saved.doctor.name} from ${formatTime(saved.appointment_time)} to ${formatTime(saved.appointment_end_time)} (${formatDuration(saved.duration_minutes)}) on ${formatDate(saved.appointment_date)}.`);
        try{await loadPatients();}catch(_){/* The committed registration remains confirmed; the list can be refreshed separately. */}
    }catch(err){message(err.message);}
    finally{finishFormSubmission(form);}
}

async function loadAppointmentOptions(){
    const durationField=document.getElementById('pduration');
    if(!durationField) return;
    try{
        const options=await request('/appointment-options');
        durationField.replaceChildren(new Option('Select appointment duration',''));
        for(const duration of options.durations||[]) durationField.add(new Option(formatDuration(duration),String(duration)));
    }catch(err){
        durationField.replaceChildren(new Option('Appointment durations unavailable',''));
        message(err.message);
    }
}

async function updatePatientDoctorPreview(){
    const disease=document.getElementById('pdisease');
    const preview=document.getElementById('assignedDoctor');
    if(!disease||!preview) return;
    if(!disease.value){preview.value='Choose a disease category';return;}
    const selectedDisease=disease.value;
    preview.value='Finding assigned doctor…';
    try{
        const doctor=await request('/doctor-assignment/'+encodeURIComponent(selectedDisease));
        if(disease.value===selectedDisease) preview.value=`${doctor.name} — ${doctor.specialization}`;
    }catch(err){if(disease.value===selectedDisease){preview.value='Doctor assignment unavailable';message(err.message);}}
}

let doctorRecords=[];
async function loadDoctors(){
    const tableBody=document.getElementById('doctorTable');
    try{
        doctorRecords=await request('/doctors');
        renderDoctors();
    }catch(err){
        message(err.message);
        if(tableBody){
            renderDoctorTableMessage(tableBody,'Unable to load doctors. Please try again later.');
            const count=document.getElementById('doctorCount');
            if(count) count.textContent='Doctors unavailable';
        }
    }
}
function renderDoctors(){
    const tableBody=document.getElementById('doctorTable');
    if(!tableBody) return;
    const search=(document.getElementById('doctorSearch')?.value||'').trim().toLowerCase();
    const rows=doctorRecords.filter(doctor=>
        [doctor.name,doctor.specialization]
            .some(value=>String(value??'').toLowerCase().includes(search))
    );
    const count=document.getElementById('doctorCount');
    if(count) count.textContent=`${rows.length} ${rows.length===1?'doctor':'doctors'}`;
    tableBody.replaceChildren();
    if(!rows.length){
        renderDoctorTableMessage(tableBody,doctorRecords.length?'No doctors match your search.':'No doctor records found.');
        return;
    }
    for(const doctor of rows){
        const row=document.createElement('tr');
        for(const value of [doctor.name,doctor.specialization]){
            const cell=document.createElement('td');
            cell.textContent=value===null||value===undefined||value===''?'—':String(value);
            row.appendChild(cell);
        }
        tableBody.appendChild(row);
    }
}
function renderDoctorTableMessage(tableBody,text){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='doctors-empty-row';
    cell.colSpan=2;
    cell.textContent=text;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}

async function loadDoctorSchedules(){
    const dateField=document.getElementById('doctorScheduleDate');
    const cards=document.getElementById('doctorScheduleCards');
    const status=document.getElementById('doctorScheduleStatus');
    if(!cards||!status) return;
    status.textContent='Loading doctor schedules...';
    cards.replaceChildren();
    try{
        const selectedDate=dateField?.value||'';
        const query=selectedDate?`?date=${encodeURIComponent(selectedDate)}`:'';
        const schedule=await request('/doctors/schedule'+query);
        if(dateField) dateField.value=schedule.date;
        renderDoctorSchedules(schedule.doctors||[]);
        status.textContent=`${(schedule.doctors||[]).length} doctors | ${formatDate(schedule.date)} | ${schedule.time_zone}`;
    }catch(err){
        status.textContent='Unable to load doctor schedules. Use Refresh to try again.';
        cards.replaceChildren();
        message(err.message);
    }
}

function renderDoctorSchedules(doctors){
    const cards=document.getElementById('doctorScheduleCards');
    if(!cards) return;
    cards.replaceChildren();
    if(!doctors.length){
        const empty=document.createElement('p');
        empty.className='doctor-schedule-empty';
        empty.textContent='No doctors are available.';
        cards.appendChild(empty);
        return;
    }
    for(const doctor of doctors){
        const card=document.createElement('article');
        card.className='doctor-schedule-card';
        const heading=document.createElement('h3');
        heading.textContent=doctor.name||'Doctor';
        card.appendChild(heading);
        const specialization=document.createElement('p');
        specialization.className='doctor-schedule-specialization';
        specialization.textContent=doctor.specialization||'Specialization not listed';
        card.appendChild(specialization);
        const state=document.createElement('span');
        const unconfigured=!doctor.working_hours_configured;
        state.className=`doctor-schedule-state${unconfigured?' is-unconfigured':doctor.fully_booked?' is-full':' is-available'}`;
        state.textContent=doctor.availability_message||'Availability unavailable';
        card.appendChild(state);

        const metrics=document.createElement('dl');
        metrics.className='doctor-schedule-metrics';
        const metricValues=[
            ['Booked from date onward',doctor.active_future_appointment_count],
            ['Booked on selected date',doctor.selected_date_appointment_count],
            ['Booked duration (recorded)',formatDuration(doctor.booked_duration_minutes)||'0 minutes'],
            ['Free time remaining',formatDuration(doctor.remaining_free_minutes)||'0 minutes']
        ];
        for(const [label,value] of metricValues){
            const item=document.createElement('div');
            const term=document.createElement('dt');term.textContent=label;
            const detail=document.createElement('dd');detail.textContent=String(value);
            item.append(term,detail);metrics.appendChild(item);
        }
        card.appendChild(metrics);
        if(doctor.unknown_duration_appointment_count){
            const warning=document.createElement('p');
            warning.className='doctor-schedule-empty';
            warning.textContent=`${doctor.unknown_duration_appointment_count} booked appointment(s) have no recorded duration. Stored end times are used when present; bookings with neither a duration nor end time conservatively block the rest of the working day.`;
            card.appendChild(warning);
        }

        appendDoctorScheduleTokens(card,'Working hours',doctor.working_intervals||[],'start_time','end_time','doctor-schedule-hours',unconfigured?'Working hours not configured':'No working hours today');
        appendDoctorScheduleTokens(card,'Available intervals',doctor.free_intervals||[],'start_time','end_time','doctor-schedule-free',unconfigured?'Availability unavailable':'No free intervals');
        appendDoctorAppointments(card,doctor.appointments||[]);
        cards.appendChild(card);
    }
}

function appendDoctorScheduleTokens(card,title,intervals,startKey,endKey,className,emptyText){
    const section=document.createElement('section');section.className='doctor-schedule-section';
    const heading=document.createElement('h4');heading.textContent=title;section.appendChild(heading);
    const list=document.createElement('div');list.className=className;
    if(intervals.length){
        for(const interval of intervals){
            const token=document.createElement('span');
            token.textContent=`${formatTime(interval[startKey])} - ${formatTime(interval[endKey])}`;
            list.appendChild(token);
        }
    }else{
        const empty=document.createElement('p');empty.className='doctor-schedule-empty';empty.textContent=emptyText;list.appendChild(empty);
    }
    section.appendChild(list);card.appendChild(section);
}

function appendDoctorAppointments(card,appointments){
    const section=document.createElement('section');section.className='doctor-schedule-section';
    const heading=document.createElement('h4');heading.textContent='Appointment schedule';section.appendChild(heading);
    if(!appointments.length){
        const empty=document.createElement('p');empty.className='doctor-schedule-empty';empty.textContent='No appointments scheduled for this date.';section.appendChild(empty);
    }else{
        const list=document.createElement('ul');list.className='doctor-schedule-appointments';
        for(const appointment of appointments){
            const item=document.createElement('li');item.className='doctor-schedule-appointment';
            const time=document.createElement('time');
            const start=formatTime(appointment.start_time);
            const end=formatTime(appointment.end_time);
            time.textContent=end?`${start} to ${end}`:`${start} (end unknown)`;
            const duration=document.createElement('small');
            duration.textContent=appointment.duration_minutes===null?'Duration not recorded':formatDuration(appointment.duration_minutes);
            const status=document.createElement('em');
            const name=String(appointment.status||'Unknown');
            status.textContent=name;
            if(name==='Cancelled') status.classList.add('is-cancelled');
            if(name==='Completed') status.classList.add('is-completed');
            item.append(time,duration,status);list.appendChild(item);
        }
        section.appendChild(list);
    }
    card.appendChild(section);
}

async function loadAppointments(){
    const tableBody=document.getElementById('appointmentTable');
    if(!tableBody) return;
    try{
        const rows=await request('/appointments');
        const count=document.getElementById('appointmentCount');
        if(count) count.textContent=`${rows.length} ${rows.length===1?'appointment':'appointments'}`;
        tableBody.replaceChildren();
        if(!rows.length){
            renderAppointmentTableMessage(tableBody,'No appointments have been scheduled.');
            return;
        }
        for(const appointment of rows){
            const row=document.createElement('tr');
            const values=[
                appointment.appointment_id,
                appointment.patient_name,
                appointment.doctor_name,
                formatDate(appointment.appointment_date),
                formatAppointmentInterval(appointment)
            ];
            for(const value of values){
                const cell=document.createElement('td');
                cell.textContent=value===null||value===undefined||value===''?'—':String(value);
                row.appendChild(cell);
            }
            const statusCell=document.createElement('td');
            const status=document.createElement('span');
            const statusName=String(appointment.status||'Unknown');
            status.className=`appointments-status-badge${statusName==='Booked'?' is-booked':statusName==='Cancelled'?' is-cancelled':''}`;
            status.textContent=statusName;
            statusCell.appendChild(status);
            row.appendChild(statusCell);
            const actionCell=document.createElement('td');
            if(statusName==='Booked'){
                const cancelButton=document.createElement('button');
                cancelButton.type='button';
                cancelButton.className='appointments-cancel';
                cancelButton.textContent='Cancel';
                cancelButton.setAttribute('aria-label',`Cancel appointment ${appointment.appointment_id}`);
                cancelButton.addEventListener('click',()=>cancelAppointment(appointment.appointment_id));
                actionCell.appendChild(cancelButton);
            }else{
                actionCell.textContent='—';
                actionCell.className='appointments-no-action';
            }
            row.appendChild(actionCell);
            tableBody.appendChild(row);
        }
    }catch(err){
        renderAppointmentTableMessage(tableBody,'Unable to load appointments.');
        const count=document.getElementById('appointmentCount');
        if(count) count.textContent='Appointments unavailable';
        message(err.message);
        throw err;
    }
}
function renderAppointmentTableMessage(tableBody,text){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='appointments-empty-row';
    cell.colSpan=7;
    cell.textContent=text;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}
async function cancelAppointment(id){try{await request('/appointments/'+id+'/cancel',{method:'PUT'});notifyAppointmentsChanged();message('Appointment cancelled');await loadAppointments();}catch(e){message(e.message);}}

async function loadEmergency(){
    const tableBody=document.getElementById('emergencyTable');
    if(!tableBody) return;
    try{
        const rows=await request('/emergency');
        const count=document.getElementById('emergencyCount');
        if(count){
            const waiting=rows.filter(record=>record.status==='Waiting').length;
            count.textContent=`${rows.length} ${rows.length===1?'case':'cases'} · ${waiting} waiting`;
        }
        tableBody.replaceChildren();
        if(!rows.length){
            renderEmergencyTableMessage(tableBody,'No emergency cases have been registered.');
            return;
        }
        for(const record of rows){
            const row=document.createElement('tr');
            const idCell=document.createElement('td');
            idCell.textContent=record.case_id===null||record.case_id===undefined?'—':String(record.case_id);
            row.appendChild(idCell);
            const patientCell=document.createElement('td');
            patientCell.textContent=record.patient_name||'—';
            row.appendChild(patientCell);
            const conditionCell=document.createElement('td');
            conditionCell.textContent=record.condition_name||'—';
            row.appendChild(conditionCell);
            const priorityCell=document.createElement('td');
            const priority=document.createElement('span');
            const priorityLabels={1:'Critical',2:'Serious',3:'Moderate',4:'Normal'};
            const priorityValue=Number(record.priority);
            priority.className=`emergency-priority-badge${priorityValue===1?' is-critical':priorityValue===2?' is-serious':priorityValue===3?' is-moderate':priorityValue===4?' is-normal':''}`;
            priority.textContent=priorityLabels[priorityValue]?`${priorityValue} · ${priorityLabels[priorityValue]}`:String(record.priority??'—');
            priorityCell.appendChild(priority);
            row.appendChild(priorityCell);
            const statusCell=document.createElement('td');
            const status=document.createElement('span');
            const statusValue=String(record.status||'Unknown');
            status.className=`emergency-status-badge${statusValue==='Waiting'?' is-waiting':statusValue==='Treated'?' is-treated':''}`;
            status.textContent=statusValue;
            statusCell.appendChild(status);
            row.appendChild(statusCell);
            const actionCell=document.createElement('td');
            if(statusValue==='Waiting'){
                const treatButton=document.createElement('button');
                treatButton.type='button';
                treatButton.className='emergency-treat-button';
                treatButton.textContent='Mark treated';
                treatButton.setAttribute('aria-label',`Mark emergency case ${record.case_id} treated`);
                treatButton.addEventListener('click',()=>treatEmergency(record.case_id));
                actionCell.appendChild(treatButton);
            }else{
                actionCell.textContent='—';
                actionCell.className='emergency-no-action';
            }
            row.appendChild(actionCell);
            tableBody.appendChild(row);
        }
    }catch(err){
        renderEmergencyTableMessage(tableBody,'Unable to load emergency cases.');
        const count=document.getElementById('emergencyCount');
        if(count) count.textContent='Cases unavailable';
        message(err.message);
        throw err;
    }
}
function renderEmergencyTableMessage(tableBody,text){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='emergency-empty-row';
    cell.colSpan=6;
    cell.textContent=text;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}
async function addEmergency(e){
    const form=beginFormSubmission(e);
    if(!form) return;
    try{
        await request('/emergency',{method:'POST',body:JSON.stringify({patient_name:ename.value,condition_name:econdition.value,priority:Number(epriority.value)})});
        form.reset();
        for(const field of form.querySelectorAll('input,select,textarea')) setFieldError(field,'');
        message('Emergency case added');
        await loadEmergency();
    }catch(err){message(err.message);}
    finally{finishFormSubmission(form);}
}
async function treatEmergency(id){try{await request('/emergency/'+id+'/treat',{method:'PUT'});message('Emergency case marked treated');await loadEmergency();}catch(e){message(e.message);}}

let selectedBed=null;
async function loadBeds(){
    const tableBody=document.getElementById('bedTable');
    if(!tableBody) return;
    try{
        const rows=await request('/beds');
        const available=rows.filter(bed=>bed.status==='Available').length;
        const occupied=rows.filter(bed=>bed.status==='Occupied').length;
        const total=document.getElementById('bedsTotal');
        const availableCount=document.getElementById('bedsAvailable');
        const occupiedCount=document.getElementById('bedsOccupied');
        const listCount=document.getElementById('bedListCount');
        if(total) total.textContent=String(rows.length);
        if(availableCount) availableCount.textContent=String(available);
        if(occupiedCount) occupiedCount.textContent=String(occupied);
        if(listCount) listCount.textContent=`${rows.length} ${rows.length===1?'bed':'beds'}`;
        tableBody.replaceChildren();
        if(!rows.length){
            renderBedTableMessage(tableBody,'No bed records are available.');
            return;
        }
        for(const bed of rows){
            const row=document.createElement('tr');
            const values=[bed.bed_id,bed.room_no,bed.ward];
            for(const value of values){
                const cell=document.createElement('td');
                cell.textContent=value===null||value===undefined||value===''?'—':String(value);
                row.appendChild(cell);
            }
            const statusCell=document.createElement('td');
            const status=document.createElement('span');
            const statusValue=String(bed.status||'Unknown');
            status.className=`beds-status-badge${statusValue==='Available'?' is-available':statusValue==='Occupied'?' is-occupied':''}`;
            status.textContent=statusValue;
            statusCell.appendChild(status);
            row.appendChild(statusCell);
            const patientCell=document.createElement('td');
            patientCell.textContent=bed.patient_id===null||bed.patient_id===undefined||bed.patient_id===''?'—':String(bed.patient_id);
            row.appendChild(patientCell);
            const actionCell=document.createElement('td');
            const action=document.createElement('button');
            action.type='button';
            if(statusValue==='Available'){
                action.className='beds-allocate-action';
                action.textContent='Select bed';
                action.setAttribute('aria-label',`Select bed ${bed.bed_id} for allocation`);
                action.addEventListener('click',()=>selectBed(bed.bed_id));
                actionCell.appendChild(action);
            }else if(statusValue==='Occupied'){
                action.className='beds-release-action';
                action.textContent='Release';
                action.setAttribute('aria-label',`Release bed ${bed.bed_id}`);
                action.addEventListener('click',()=>releaseBed(bed.bed_id));
                actionCell.appendChild(action);
            }else{
                actionCell.textContent='—';
                actionCell.className='beds-no-action';
            }
            row.appendChild(actionCell);
            tableBody.appendChild(row);
        }
    }catch(err){
        renderBedTableMessage(tableBody,'Unable to load beds.');
        const listCount=document.getElementById('bedListCount');
        if(listCount) listCount.textContent='Beds unavailable';
        message(err.message);
        throw err;
    }
}
function renderBedTableMessage(tableBody,text){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='beds-empty-row';
    cell.colSpan=6;
    cell.textContent=text;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}
function selectBed(id){
    selectedBed=id;
    document.getElementById('bedAllocationForm').requestSubmit();
}
async function allocateBed(e){
    if(e){
        const form=beginFormSubmission(e);
        if(!form) return;
        if(!selectedBed){
            setFieldError(document.getElementById('bedPatient'),'Select an available bed first.');
            document.getElementById('bedPatient').focus();
            finishFormSubmission(form);
            return;
        }
        try{
            await request('/beds/'+selectedBed+'/allocate',{method:'PUT',body:JSON.stringify({patient_id:Number(bedPatient.value)})});
            selectedBed=null;
            form.reset();
            for(const field of form.querySelectorAll('input,select,textarea')) setFieldError(field,'');
            message('Bed allocated');
            await loadBeds();
        }catch(err){message(err.message);}
        finally{finishFormSubmission(form);}
    }
}
async function releaseBed(id){try{await request('/beds/'+id+'/release',{method:'PUT'});message('Bed released');await loadBeds();}catch(e){message(e.message);}}

let medicineRecords=[];
async function loadMedicines(){
    const tableBody=document.getElementById('medicineTable');
    if(!tableBody) return;
    try{
        medicineRecords=await request('/medicines');
        renderMedicines();
    }catch(err){
        renderMedicineTableMessage(tableBody,'Unable to load medicines.');
        const listCount=document.getElementById('medicineListCount');
        if(listCount) listCount.textContent='Inventory unavailable';
        message(err.message);
        throw err;
    }
}
function renderMedicines(){
    const tableBody=document.getElementById('medicineTable');
    if(!tableBody) return;
    const search=(document.getElementById('medicineSearch')?.value||'').trim().toLowerCase();
    const stockFilter=document.getElementById('medicineStockFilter')?.value||'';
    const lowStockCount=medicineRecords.filter(medicine=>medicine.quantity<10).length;
    const totalUnits=medicineRecords.reduce((total,medicine)=>total+(Number(medicine.quantity)||0),0);
    const medicineCount=document.getElementById('medicineCount');
    const units=document.getElementById('medicineUnits');
    const lowStock=document.getElementById('medicineLowStock');
    if(medicineCount) medicineCount.textContent=String(medicineRecords.length);
    if(units) units.textContent=String(totalUnits);
    if(lowStock) lowStock.textContent=String(lowStockCount);
    const rows=medicineRecords.filter(medicine=>{
        const matchesSearch=[medicine.medicine_id,medicine.name,medicine.quantity,medicine.price,formatDate(medicine.expiry_date)]
            .some(value=>String(value??'').toLowerCase().includes(search));
        const isLowStock=medicine.quantity<10;
        return matchesSearch&&(!stockFilter||(stockFilter==='low'?isLowStock:!isLowStock));
    });
    const listCount=document.getElementById('medicineListCount');
    if(listCount) listCount.textContent=`Showing ${rows.length} of ${medicineRecords.length} ${medicineRecords.length===1?'medicine':'medicines'}`;
    tableBody.replaceChildren();
    if(!rows.length){
        renderMedicineTableMessage(tableBody,medicineRecords.length?'No medicines match these filters.':'No medicine records found.');
        return;
    }
    for(const medicine of rows){
        const row=document.createElement('tr');
        const values=[medicine.medicine_id,medicine.name,medicine.quantity,medicine.price===null||medicine.price===undefined||medicine.price===''?'':`₹${medicine.price}`,formatDate(medicine.expiry_date)];
        for(const value of values){
            const cell=document.createElement('td');
            cell.textContent=value===null||value===undefined||value===''?'—':String(value);
            row.appendChild(cell);
        }
        const stockCell=document.createElement('td');
        const badge=document.createElement('span');
        const isLowStock=medicine.quantity<10;
        badge.className=`pharmacy-stock-badge${isLowStock?' is-low-stock':' is-in-stock'}`;
        badge.textContent=isLowStock?'LOW STOCK':'OK';
        stockCell.appendChild(badge);
        row.appendChild(stockCell);
        tableBody.appendChild(row);
    }
}
function renderMedicineTableMessage(tableBody,text){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='pharmacy-empty-row';
    cell.colSpan=6;
    cell.textContent=text;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}
async function addMedicine(e){
    e.preventDefault();
    try{await request('/medicines',{method:'POST',body:JSON.stringify({name:mname.value,quantity:Number(mquantity.value),price:Number(mprice.value),expiry_date:mexpiry.value||null})});message('Medicine added');e.target.reset();await loadMedicines();}
    catch(err){message(err.message);}
}

let labRecords=[];
async function loadLabs(){
    const tableBody=document.getElementById('labTable');
    if(!tableBody) return;
    try{
        labRecords=await request('/labs');
        renderLabs();
    }catch(err){
        renderLabTableMessage(tableBody,'Unable to load laboratory records.');
        const listCount=document.getElementById('labListCount');
        if(listCount) listCount.textContent='Laboratory records unavailable';
        message(err.message);
        throw err;
    }
}
function renderLabs(){
    const tableBody=document.getElementById('labTable');
    if(!tableBody) return;
    const search=(document.getElementById('labSearch')?.value||'').trim().toLowerCase();
    const statusFilter=document.getElementById('labStatusFilter')?.value||'';
    const total=document.getElementById('labTotal');
    const pending=document.getElementById('labPending');
    const completed=document.getElementById('labCompleted');
    if(total) total.textContent=String(labRecords.length);
    if(pending) pending.textContent=String(labRecords.filter(record=>record.status==='Pending').length);
    if(completed) completed.textContent=String(labRecords.filter(record=>record.status==='Completed').length);
    const rows=labRecords.filter(record=>{
        const matchesSearch=[record.test_id,record.patient_name,record.test_name,record.result,formatDate(record.test_date)]
            .some(value=>String(value??'').toLowerCase().includes(search));
        return matchesSearch&&(!statusFilter||record.status===statusFilter);
    });
    const listCount=document.getElementById('labListCount');
    if(listCount) listCount.textContent=`Showing ${rows.length} of ${labRecords.length} ${labRecords.length===1?'test':'tests'}`;
    tableBody.replaceChildren();
    if(!rows.length){
        renderLabTableMessage(tableBody,labRecords.length?'No tests match these filters.':'No laboratory records found.');
        return;
    }
    for(const record of rows){
        const row=document.createElement('tr');
        const values=[record.test_id,record.patient_name,record.test_name,record.result||'',formatDate(record.test_date)];
        for(const value of values){
            const cell=document.createElement('td');
            cell.textContent=value===null||value===undefined||value===''?'—':String(value);
            row.appendChild(cell);
        }
        const statusCell=document.createElement('td');
        const badge=document.createElement('span');
        const status=String(record.status||'Unknown');
        badge.className=`laboratory-status-badge${status==='Pending'?' is-pending':status==='Completed'?' is-completed':''}`;
        badge.textContent=status;
        statusCell.appendChild(badge);
        row.appendChild(statusCell);
        tableBody.appendChild(row);
    }
}
function renderLabTableMessage(tableBody,text){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='laboratory-empty-row';
    cell.colSpan=6;
    cell.textContent=text;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}
async function addLab(e){
    e.preventDefault();
    try{await request('/labs',{method:'POST',body:JSON.stringify({patient_id:lpatient.value,test_name:ltest.value,result:lresult.value,status:lstatus.value})});message('Lab test added');e.target.reset();await loadLabs();}
    catch(err){message(err.message);}
}

let billingRecords=[];

function formatBillAmount(value){
    const amount=Number(value);
    return Number.isFinite(amount)
        ? new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)
        : '—';
}

async function loadBills(){
    const tableBody=document.getElementById('billTable');
    if(!tableBody) return;
    try{
        const rows=await request('/bills');
        billingRecords=Array.isArray(rows) ? rows : [];
        renderBills();
        return true;
    }catch(err){
        billingRecords=[];
        renderBills();
        message(err.message);
        return false;
    }
}

function renderBills(){
    const tableBody=document.getElementById('billTable');
    if(!tableBody) return;
    const search=(document.getElementById('billingSearch')?.value||'').trim().toLowerCase();
    const totalAmount=billingRecords.reduce((sum,bill)=>{
        const amount=Number(bill.total);
        return sum+(Number.isFinite(amount)?amount:0);
    },0);
    const count=document.getElementById('billingCount');
    const billed=document.getElementById('billingTotal');
    const latest=document.getElementById('billingLatest');
    const tableMeta=document.getElementById('billingTableMeta');
    if(count) count.textContent=String(billingRecords.length);
    if(billed) billed.textContent=formatBillAmount(totalAmount);
    if(latest) latest.textContent=billingRecords.length ? formatDate(billingRecords[0].bill_date)||'—' : '—';

    const rows=billingRecords.filter(bill=>
        [bill.bill_id,bill.patient_name,bill.patient_id,bill.bill_date,formatDate(bill.bill_date)]
            .some(value=>String(value??'').toLowerCase().includes(search))
    );
    if(tableMeta) tableMeta.textContent=`Showing ${rows.length} of ${billingRecords.length} ${billingRecords.length===1?'bill':'bills'}`;
    tableBody.replaceChildren();
    if(!rows.length){
        const row=document.createElement('tr');
        const cell=document.createElement('td');
        cell.colSpan=7;
        cell.className='billing-empty-row';
        cell.textContent=billingRecords.length ? 'No bills match your search.' : 'No bill records are available.';
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }
    for(const bill of rows){
        const row=document.createElement('tr');
        const values=[
            {text:`#${bill.bill_id??''}`,className:'billing-id-cell'},
            {text:bill.patient_name||'—',className:'billing-patient-cell'},
            {text:formatBillAmount(bill.consultation_fee)},
            {text:formatBillAmount(bill.medicine_fee)},
            {text:formatBillAmount(bill.lab_fee)},
            {text:formatBillAmount(bill.total),className:'billing-total-cell'},
            {text:formatDate(bill.bill_date)||'—'}
        ];
        for(const value of values){
            const cell=document.createElement('td');
            cell.textContent=value.text;
            if(value.className) cell.className=value.className;
            row.appendChild(cell);
        }
        tableBody.appendChild(row);
    }
}
async function addBill(e){
    e.preventDefault();
    try{
        const d=await request('/bills',{method:'POST',body:JSON.stringify({patient_id:document.getElementById('bpatient').value,consultation_fee:document.getElementById('bconsult').value,medicine_fee:document.getElementById('bmedicine').value,lab_fee:document.getElementById('blab').value})});
        e.target.reset();
        if(await loadBills()) message('Bill generated. Total = '+formatBillAmount(d.total));
    }catch(err){message(err.message);}
}

for(const formId of ['patientForm','emergencyForm','bedAllocationForm']){
    bindValidation(document.getElementById(formId));
}

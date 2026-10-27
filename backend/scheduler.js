const DEFAULT_DURATIONS = [30, 60];

function supportedDurations(raw = process.env.APPOINTMENT_DURATIONS_MINUTES) {
    if (raw === undefined || raw.trim() === '') return DEFAULT_DURATIONS.slice();
    const values = raw.split(',').map(value => Number(value.trim()));
    if (!values.length || values.some(value => !Number.isInteger(value) || value < 5 || value > 480)) {
        throw new Error('APPOINTMENT_DURATIONS_MINUTES must contain comma-separated whole minutes from 5 to 480');
    }
    return [...new Set(values)].sort((a, b) => a - b);
}

function timeToMinutes(value) {
    const match = String(value ?? '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const seconds = Number(match[3] || 0);
    if (hour > 23 || minute > 59 || seconds > 59) return null;
    return hour * 60 + minute + (seconds ? 1 : 0);
}

function minutesToTime(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function dateAfter(date, offset) {
    const [year, month, day] = date.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + offset));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function weekdayFor(date) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 1; // MySQL DAYOFWEEK: Sunday=1
}

function intervalsOverlap(newStart, newEnd, existingStart, existingEnd) {
    return newStart < existingEnd && newEnd > existingStart;
}

function normalizedWorkingIntervals(workingHours) {
    const intervals=workingHours
        .map(row=>({start:timeToMinutes(row.start_time),end:timeToMinutes(row.end_time)}))
        .filter(interval=>interval.start!==null&&interval.end!==null&&interval.end>interval.start)
        .sort((a,b)=>a.start-b.start);
    const merged=[];
    for(const interval of intervals){
        const previous=merged[merged.length-1];
        if(previous&&interval.start<=previous.end) previous.end=Math.max(previous.end,interval.end);
        else merged.push({...interval});
    }
    return merged;
}

function appointmentEndMinutes(appointment,start) {
    const explicit=timeToMinutes(appointment.appointment_end_time);
    if(explicit!==null) return explicit;
    const duration=Number(appointment.duration_minutes);
    if(Number.isInteger(duration)&&duration>0) return start+duration;
    return 24*60;
}

function summarizeDoctorDay({date,workingHours,appointments}) {
    const workIntervals=normalizedWorkingIntervals(workingHours);
    const sortedAppointments=appointments
        .filter(appointment=>date===undefined||String(appointment.appointment_date).slice(0,10)===date)
        .map(appointment=>{
            const start=timeToMinutes(appointment.appointment_time);
            if(start===null) return null;
            const end=appointmentEndMinutes(appointment,start);
            const endStored=timeToMinutes(appointment.appointment_end_time);
            const durationValue=Number(appointment.duration_minutes);
            const duration=Number.isInteger(durationValue)&&durationValue>0 ? durationValue : null;
            return {
                appointment_id:appointment.appointment_id,
                start,
                end,
                start_time:appointment.appointment_time,
                end_time:endStored===null&&duration===null?null:minutesToTime(endStored??end),
                duration_minutes:duration,
                status:appointment.status
            };
        })
        .filter(Boolean)
        .sort((a,b)=>a.start-b.start);
    const active=sortedAppointments.filter(appointment=>appointment.status==='Booked');
    const bookedDurationMinutes=active.reduce((sum,appointment)=>sum+(appointment.duration_minutes||0),0);
    const unknownDurationCount=active.filter(appointment=>appointment.duration_minutes===null).length;
    const busy=[];
    for(const work of workIntervals){
        const clipped=active
            .filter(appointment=>intervalsOverlap(work.start,work.end,appointment.start,appointment.end))
            .map(appointment=>({start:Math.max(work.start,appointment.start),end:Math.min(work.end,appointment.end)}))
            .sort((a,b)=>a.start-b.start);
        for(const interval of clipped){
            const previous=busy[busy.length-1];
            if(previous&&interval.start<=previous.end) previous.end=Math.max(previous.end,interval.end);
            else busy.push({...interval});
        }
    }
    const free=[];
    for(const work of workIntervals){
        let cursor=work.start;
        for(const interval of busy){
            if(interval.end<=cursor||interval.start>=work.end) continue;
            if(interval.start>cursor) free.push({start:cursor,end:interval.start});
            cursor=Math.max(cursor,interval.end);
            if(cursor>=work.end) break;
        }
        if(cursor<work.end) free.push({start:cursor,end:work.end});
    }
    const totalWorkingMinutes=workIntervals.reduce((sum,interval)=>sum+interval.end-interval.start,0);
    const remainingFreeMinutes=free.reduce((sum,interval)=>sum+interval.end-interval.start,0);
    return {
        working_hours_configured:workIntervals.length>0,
        working_intervals:workIntervals.map(interval=>({start_time:minutesToTime(interval.start),end_time:minutesToTime(interval.end)})),
        appointments:sortedAppointments.map(appointment=>({
            appointment_id:appointment.appointment_id,
            start_time:appointment.start_time,
            end_time:appointment.end_time,
            duration_minutes:appointment.duration_minutes,
            status:appointment.status
        })),
        booked_appointment_count:active.length,
        booked_duration_minutes:bookedDurationMinutes,
        unknown_duration_appointment_count:unknownDurationCount,
        total_working_minutes:totalWorkingMinutes,
        remaining_free_minutes:remainingFreeMinutes,
        fully_booked:workIntervals.length>0&&remainingFreeMinutes===0,
        free_intervals:free.map(interval=>({start_time:minutesToTime(interval.start),end_time:minutesToTime(interval.end),duration_minutes:interval.end-interval.start}))
    };
}

function findEarliestSlot({ startDate, horizonDays, durationMinutes, workingHours, appointments, nowMinutes = 0 }) {
    const activeAppointments = appointments.filter(appointment => appointment.status === 'Booked');
    for (let offset = 0; offset < horizonDays; offset += 1) {
        const date = dateAfter(startDate, offset);
        const day = weekdayFor(date);
        const hours = workingHours
            .filter(row => Number(row.day_of_week) === day && (row.is_active === undefined || Number(row.is_active) === 1))
            .map(row => ({ start: timeToMinutes(row.start_time), end: timeToMinutes(row.end_time) }))
            .filter(interval => interval.start !== null && interval.end !== null && interval.end > interval.start)
            .sort((a, b) => a.start - b.start);
        const bookings = activeAppointments
            .filter(appointment => String(appointment.appointment_date).slice(0, 10) === date)
            .map(appointment => {
                const start = timeToMinutes(appointment.appointment_time);
                const explicitEnd = timeToMinutes(appointment.appointment_end_time);
                // Legacy rows have no duration in the original schema; reserve the rest of the day conservatively.
                const end = explicitEnd ?? (start === null ? null : 24 * 60);
                return { start, end };
            })
            .filter(interval => interval.start !== null && interval.end !== null && interval.end > interval.start)
            .sort((a, b) => a.start - b.start);

        for (const interval of hours) {
            let cursor = Math.max(interval.start, offset === 0 ? nowMinutes : 0);
            for (const booking of bookings) {
                if (booking.end <= cursor || booking.start >= interval.end) continue;
                if (booking.start >= cursor && booking.start - cursor >= durationMinutes) {
                    return { appointment_date: date, appointment_time: minutesToTime(cursor), appointment_end_time: minutesToTime(cursor + durationMinutes) };
                }
                cursor = Math.max(cursor, booking.end);
                if (cursor + durationMinutes > interval.end) break;
            }
            if (cursor + durationMinutes <= interval.end) {
                return { appointment_date: date, appointment_time: minutesToTime(cursor), appointment_end_time: minutesToTime(cursor + durationMinutes) };
            }
        }
    }
    return null;
}

function isSlotAvailable({ date, startTime, durationMinutes, workingHours, appointments, doctorId }) {
    const start = timeToMinutes(startTime);
    if (start === null) return false;
    const end = start + durationMinutes;
    const day = weekdayFor(date);
    const insideHours = workingHours.some(row => Number(row.day_of_week) === day
        && (row.is_active === undefined || Number(row.is_active) === 1)
        && timeToMinutes(row.start_time) <= start
        && timeToMinutes(row.end_time) >= end);
    if (!insideHours) return false;
    return !appointments.some(appointment=>{
        if(appointment.status!=='Booked'
            || (doctorId!==undefined&&Number(appointment.doctor_id)!==Number(doctorId))
            || String(appointment.appointment_date).slice(0,10)!==date) return false;
        const existingStart=timeToMinutes(appointment.appointment_time);
        if(existingStart===null) return false;
        return intervalsOverlap(start,end,existingStart,appointmentEndMinutes(appointment,existingStart));
    });
}

module.exports = { supportedDurations, timeToMinutes, minutesToTime, dateAfter, intervalsOverlap, findEarliestSlot, isSlotAvailable, summarizeDoctorDay };

import { CronJob, SystemStatus } from '../../types';
import { parsePiClock, piWallClock } from '../piClock';

// Matches a schedule against the running broadcast's standard, duration and start.
export function isScheduleLive(job: CronJob, status: SystemStatus | null): boolean {
    if (!status?.services.txtempus_running) return false;
    if (status.services.txtempus_duration !== parseInt(job.radio_details.duration)) return false;
    if (status.services.txtempus_service && job.radio_details.service !== status.services.txtempus_service) return false;
    if (!status.services.txtempus_started_at) return false;

    try {
        // Schedules fire on the Pi's clock, so the start is read there too.
        const started = parsePiClock(status.services.txtempus_started_at);
        if (!started) return false;
        const startedAt = piWallClock(started.instantMs, started.utcOffsetMinutes);
        const startedMinutes = startedAt.getUTCHours() * 60 + startedAt.getUTCMinutes();
        const [hours, minutes] = job.friendly_time.split(':').map(Number);
        return Math.abs(startedMinutes - (hours * 60 + minutes)) <= 1;
    } catch {
        return false;
    }
}

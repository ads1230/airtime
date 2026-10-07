// txtempus encodes the Pi's own local time, so the dashboard reads times on the Pi's clock, not this device's.

export interface PiClock {
    instantMs: number;
    utcOffsetMinutes: number;
}

// The daemon sends RFC 3339: "2026-10-07T01:05:12-04:00", or a trailing Z for UTC.
const OFFSET_SUFFIX = /(?:([+-])(\d{2}):(\d{2})|Z)$/;

export function parsePiClock(stamp: string): PiClock | null {
    const instantMs = Date.parse(stamp);
    const match = OFFSET_SUFFIX.exec(stamp);
    if (Number.isNaN(instantMs) || !match) return null;

    const utcOffsetMinutes = match[1]
        ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
        : 0;
    return { instantMs, utcOffsetMinutes };
}

// Read the result with the UTC getters, or format it with timeZone: 'UTC'.
export function piWallClock(instantMs: number, utcOffsetMinutes: number): Date {
    return new Date(instantMs + utcOffsetMinutes * 60_000);
}

// How far a fixed-time broadcast runs from the Pi's clock: txtempus starts the given
// HH:MM at the minute the broadcast began, on that day, and counts on from there.
export function fixedTimeShiftMs(startedAt: string, fixedTime: string): number | null {
    const started = parsePiClock(startedAt);
    const match = /^(\d{1,2}):(\d{2})$/.exec(fixedTime);
    if (!started || !match) return null;

    const wall = piWallClock(started.instantMs, started.utcOffsetMinutes);
    const startMinute = Math.floor(wall.getTime() / 60_000) * 60_000;
    const chosen = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), Number(match[1]), Number(match[2]));
    return chosen - startMinute;
}

// Minutes east of UTC for an IANA zone at an instant, or null if this browser doesn't know the zone.
export function zoneUtcOffset(zone: string, at: Date = new Date()): number | null {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
        }).formatToParts(at);
        const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
        const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
        return Math.round((wall - at.getTime()) / 60_000);
    } catch {
        return null;
    }
}

// HH:MM:SS for a piWallClock date, which is only correct read in UTC.
export function formatWallTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { timeZone: 'UTC', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// "+1h 0m", "-30m": the way the dashboard writes a broadcast offset.
export function formatOffset(minutes: number): string {
    const hours = Math.floor(Math.abs(minutes) / 60);
    return `${minutes < 0 ? '-' : '+'}${hours > 0 ? `${hours}h ` : ''}${Math.abs(minutes) % 60}m`;
}

export function formatUtcOffset(minutes: number): string {
    if (minutes === 0) return 'UTC';
    const sign = minutes < 0 ? '−' : '+';
    const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0');
    const rest = String(Math.abs(minutes) % 60).padStart(2, '0');
    return `UTC${sign}${hours}:${rest}`;
}

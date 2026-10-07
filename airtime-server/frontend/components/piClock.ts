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

export function formatUtcOffset(minutes: number): string {
    if (minutes === 0) return 'UTC';
    const sign = minutes < 0 ? '−' : '+';
    const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0');
    const rest = String(Math.abs(minutes) % 60).padStart(2, '0');
    return `UTC${sign}${hours}:${rest}`;
}

import { useEffect, useState } from 'react';
import { parsePiClock, piWallClock } from '../components/piClock';

// Ticks the Pi's own wall clock from the daemon's system_time, correcting for
// any difference between the Pi's clock and this device's. receivedAt is when
// that system_time arrived; without it a reading seconds old would set the skew.
export function usePiClock(systemTime?: string, receivedAt?: number) {
    const [skewMs, setSkewMs] = useState(0);
    const [utcOffset, setUtcOffset] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const clock = systemTime ? parsePiClock(systemTime) : null;
        if (!clock) return;
        setSkewMs(clock.instantMs - (receivedAt ?? Date.now()));
        setUtcOffset(clock.utcOffsetMinutes);
    }, [systemTime, receivedAt]);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const instant = new Date(now + skewMs);
    return {
        instant,
        utcOffset,
        piTime: utcOffset === null ? null : piWallClock(instant.getTime(), utcOffset),
    };
}

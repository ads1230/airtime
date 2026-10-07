// How far the Pi's clock is from its time server, as a size without a sign:
// "12 µs", "1.4 ms", "23 ms", "1.2 s". Callers add "±" or "within".
export function formatClockOffset(offsetMs: number): string {
    const ms = Math.abs(offsetMs);
    if (ms < 1) return `${Math.round(ms * 1000)} µs`;
    if (ms < 10) return `${ms.toFixed(1)} ms`;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

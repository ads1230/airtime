// The broadcast lengths offered in the pickers.
export const DURATION_OPTIONS = [
    { label: '10 min', value: 10 },
    { label: '20 min', value: 20 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '4 hr', value: 240 },
    { label: '6 hr', value: 360 },
];

// A length in the pickers' words; one they don't offer, such as a Time Tester
// run, reads the same way ("12 hr", "45 min").
export function durationLabel(minutes: number): string {
    const option = DURATION_OPTIONS.find((o) => o.value === minutes);
    if (option) return option.label;
    return minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`;
}

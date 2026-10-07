import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { formatUtcOffset, zoneUtcOffset } from '../piClock';

interface TimeZoneModalProps {
    current: string;
    zones: string[];
    onSave: (zone: string) => void;
    onClose: () => void;
}

function withOffset(zone: string): string {
    const minutes = zoneUtcOffset(zone);
    return minutes === null ? zone : `${zone} · ${formatUtcOffset(minutes)}`;
}

export function TimeZoneModal({ current, zones, onSave, onClose }: TimeZoneModalProps) {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(current);
    const device = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    // Zone names use underscores, so "new york" still finds America/New_York.
    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase().replace(/\s+/g, '_');
        return needle ? zones.filter((zone) => zone.toLowerCase().includes(needle)) : zones;
    }, [query, zones]);

    const list = useRef<HTMLDivElement>(null);
    useEffect(() => {
        list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [selected, matches]);

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-sm gap-0 p-0">
                <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-border p-4">
                    <div className="rounded-full bg-on-air/20 p-1.5 text-on-air-bright">
                        <Globe size={16} />
                    </div>
                    <DialogTitle className="text-base font-bold text-heading">Time Zone</DialogTitle>
                </DialogHeader>

                <div className="space-y-3 p-4">
                    <DialogDescription className="text-[11px] leading-relaxed text-subtle-foreground">
                        AirTime broadcasts the Pi's local time, and schedules run on it too. The Pi is on{' '}
                        <span className="font-mono text-foreground">{withOffset(current)}</span>.
                    </DialogDescription>

                    {device && device !== current && zones.includes(device) && (
                        <Button variant="softPrimary" size="sm" onClick={() => setSelected(device)} className="h-auto w-full py-1.5 whitespace-normal">
                            Use this device's time zone ({device})
                        </Button>
                    )}

                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search, e.g. London"
                        aria-label="Search time zones"
                        className="bg-surface-sunken/80"
                    />

                    <div ref={list} role="listbox" aria-label="Time zones" className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-sunken/50">
                        {matches.length === 0 && (
                            <div className="p-3 text-center text-xs text-subtle-foreground">No time zone matches “{query}”.</div>
                        )}
                        {matches.map((zone) => (
                            <button
                                key={zone}
                                role="option"
                                aria-selected={zone === selected}
                                onClick={() => setSelected(zone)}
                                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors ${zone === selected ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted'}`}
                            >
                                <span className="truncate">{zone}</span>
                                {zone === current && (
                                    <span className="shrink-0 text-[10px] tracking-wide text-subtle-foreground uppercase">Current</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2 border-t border-border p-4">
                    <div className="truncate text-center font-mono text-xs text-muted-foreground">{withOffset(selected)}</div>
                    <Button
                        variant="secondary"
                        onClick={() => onSave(selected)}
                        disabled={selected === current}
                        className="w-full font-bold"
                    >
                        Apply and Restart AirTime
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

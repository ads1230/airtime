import { Loader2, Play, Square } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ServiceName } from '../serviceNames';
import { DURATION_OPTIONS, durationLabel } from '../durations';

interface BroadcastPanelProps {
    standards: string[];
    standard: string;
    duration: number;
    isTransmitting: boolean;
    activeStandard?: string | null;
    activeDuration?: number | null;
    busy: boolean;
    onChange: (standard: string, duration: number) => void;
    onToggleBroadcast: () => void;
}

const LABEL_CLASS = 'text-[10px] font-bold tracking-wider text-muted-foreground uppercase';

// At the foot of the clock card. While on air the pickers are locked and show
// what is being sent, and the button stays put and turns into Stop. On a phone
// the button gets its own row below the pickers, and Service, which carries its
// location ("DCF77 (Europe)"), takes the larger share of the row.
export function BroadcastPanel({
    standards,
    standard,
    duration,
    isTransmitting,
    activeStandard,
    activeDuration,
    busy,
    onChange,
    onToggleBroadcast,
}: BroadcastPanelProps) {
    const shownStandard = isTransmitting ? (activeStandard || standard) : standard;
    const shownDuration = isTransmitting ? (activeDuration || duration) : duration;
    // A length the list doesn't offer, such as a Time Tester run, is added so the
    // locked picker still says how long the broadcast is.
    const durationOptions = DURATION_OPTIONS.some((option) => option.value === shownDuration)
        ? DURATION_OPTIONS
        : [...DURATION_OPTIONS, { label: durationLabel(shownDuration), value: shownDuration }];

    return (
        <div className="grid grid-cols-[3fr_2fr] items-end gap-2 sm:flex">
            <div className="min-w-0 space-y-1 sm:w-44 sm:shrink-0">
                <Label className={LABEL_CLASS}>Service</Label>
                <Select
                    value={shownStandard}
                    onValueChange={(value) => onChange(value, duration)}
                    disabled={isTransmitting}
                >
                    <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {standards.map((option) => (
                            <SelectItem key={option} value={option}><ServiceName service={option} /></SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="min-w-0 space-y-1 sm:w-32 sm:shrink-0">
                <Label className={LABEL_CLASS}>Duration</Label>
                <Select
                    value={String(shownDuration)}
                    onValueChange={(value) => onChange(standard, parseInt(value))}
                    disabled={isTransmitting}
                >
                    <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {durationOptions.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Button
                onClick={onToggleBroadcast}
                disabled={busy}
                variant={isTransmitting ? 'destructive' : 'default'}
                className="col-span-2 h-10 min-w-0 font-bold shadow-lg sm:flex-1"
            >
                {busy ? <Loader2 className="animate-spin" size={16} /> : (
                    isTransmitting
                        ? <Square size={16} fill="currentColor" />
                        : <Play size={16} fill="currentColor" />
                )}
                {isTransmitting ? 'STOP BROADCAST' : busy ? 'STARTING...' : 'BROADCAST NOW'}
            </Button>
        </div>
    );
}

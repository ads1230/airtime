import { Loader2, Play, Square } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export const DURATION_OPTIONS = [
    { label: '10 min', value: 10 },
    { label: '20 min', value: 20 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '4 hr', value: 240 },
    { label: '6 hr', value: 360 },
];

const LABEL_CLASS = 'text-[10px] font-bold tracking-wider text-muted-foreground uppercase';

interface ServicePickerProps {
    standards: string[];
    standard: string;
    isTransmitting: boolean;
    activeStandard?: string | null;
    onChange: (standard: string) => void;
}

// In the control card; while on air it shows what is being sent and is locked.
export function ServicePicker({ standards, standard, isTransmitting, activeStandard, onChange }: ServicePickerProps) {
    return (
        <div className="space-y-1 pb-1">
            <Label className={LABEL_CLASS}>Service</Label>
            <Select
                value={isTransmitting ? (activeStandard || standard) : standard}
                onValueChange={onChange}
                disabled={isTransmitting}
            >
                <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {standards.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

interface BroadcastActionsProps {
    duration: number;
    isTransmitting: boolean;
    activeDuration?: number | null;
    busy: boolean;
    onDurationChange: (duration: number) => void;
    onToggleBroadcast: () => void;
}

// In the clock card. The button stays put and turns into Stop while on air.
export function BroadcastActions({ duration, isTransmitting, activeDuration, busy, onDurationChange, onToggleBroadcast }: BroadcastActionsProps) {
    return (
        <div className="flex items-end gap-2">
            <div className="w-28 shrink-0 space-y-1 sm:w-36">
                <Label className={LABEL_CLASS}>Duration</Label>
                <Select
                    value={String(isTransmitting ? (activeDuration || duration) : duration)}
                    onValueChange={(value) => onDurationChange(parseInt(value))}
                    disabled={isTransmitting}
                >
                    <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {DURATION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Button
                onClick={onToggleBroadcast}
                disabled={busy}
                variant={isTransmitting ? 'destructive' : 'default'}
                className="h-10 min-w-0 flex-1 font-bold shadow-lg"
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

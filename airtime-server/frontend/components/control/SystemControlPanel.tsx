import { Clock, Globe, RefreshCw, RotateCw, Server, Settings, Zap } from 'lucide-react';
import { TimeModeBadge } from './TimeModeBadge';
import { TimeMode } from '../../hooks/useBroadcastSettings';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

interface SystemControlPanelProps {
    ledsEnabled: boolean;
    isTransmitting: boolean;
    timeMode: TimeMode;
    fixedTime: string;
    offsetEnabled: boolean;
    offsetHours: number;
    offsetMinutes: number;
    offsetSign: number;
    timeZone: string | null;
    timeServer: string | null;
    onToggleLeds: () => void;
    onOpenTimeSettings: () => void;
    onOpenTimeZone: () => void;
    onOpenTimeServer: () => void;
    onRestartService: () => void;
    onRestartPi: () => void;
    onCheckUpdates: () => void;
}

const ROW_CLASS = 'flex items-center justify-between rounded-lg border border-border/50 bg-muted/50 p-2';

export function SystemControlPanel({
    ledsEnabled,
    isTransmitting,
    timeMode,
    fixedTime,
    offsetEnabled,
    offsetHours,
    offsetMinutes,
    offsetSign,
    timeZone,
    timeServer,
    onToggleLeds,
    onOpenTimeSettings,
    onOpenTimeZone,
    onOpenTimeServer,
    onRestartService,
    onRestartPi,
    onCheckUpdates,
}: SystemControlPanelProps) {
    return (
        <div className="space-y-2">
            <div className={ROW_CLASS}>
                <div className="flex items-center gap-2.5">
                    <div className={`rounded-full p-1.5 ${ledsEnabled ? 'bg-success/20 text-success' : 'bg-secondary text-muted-foreground'}`}>
                        <Zap size={14} />
                    </div>
                    <div className="text-sm font-medium text-foreground">System LEDs</div>
                </div>

                <Switch
                    checked={ledsEnabled}
                    onCheckedChange={onToggleLeds}
                    aria-label="Toggle system LEDs"
                    className="data-[state=checked]:bg-success-strong"
                />
            </div>

            <button
                onClick={onOpenTimeSettings}
                className={`${ROW_CLASS} w-full cursor-pointer text-left transition-colors hover:bg-muted`}
            >
                <div className="flex items-center gap-2.5">
                    <div className="rounded-full bg-secondary p-1.5 text-on-air-bright">
                        <Clock size={14} />
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        Time Settings
                        <TimeModeBadge
                            timeMode={timeMode}
                            fixedTime={fixedTime}
                            offsetEnabled={offsetEnabled}
                            offsetHours={offsetHours}
                            offsetMinutes={offsetMinutes}
                            offsetSign={offsetSign}
                        />
                    </div>
                </div>
                <Settings size={13} className="text-subtle-foreground" />
            </button>

            {timeZone && (
                <button
                    onClick={onOpenTimeZone}
                    className={`${ROW_CLASS} w-full cursor-pointer text-left transition-colors hover:bg-muted`}
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="rounded-full bg-secondary p-1.5 text-on-air-bright">
                            <Globe size={14} />
                        </div>
                        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <span className="shrink-0">Time Zone</span>
                            <span className="truncate font-mono text-[10px] text-subtle-foreground">{timeZone}</span>
                        </div>
                    </div>
                    <Settings size={13} className="shrink-0 text-subtle-foreground" />
                </button>
            )}

            {timeServer !== null && (
                <button
                    onClick={onOpenTimeServer}
                    className={`${ROW_CLASS} w-full cursor-pointer text-left transition-colors hover:bg-muted`}
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="rounded-full bg-secondary p-1.5 text-on-air-bright">
                            <Server size={14} />
                        </div>
                        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <span className="shrink-0">Time Server</span>
                            <span className="truncate font-mono text-[10px] text-subtle-foreground">{timeServer}</span>
                        </div>
                    </div>
                    <Settings size={13} className="shrink-0 text-subtle-foreground" />
                </button>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
                <Button variant="softAlt" size="sm" onClick={onRestartService} className="text-[10px] font-bold tracking-wide">
                    <RotateCw size={13} />
                    AIRTIME
                </Button>
                <Button variant="softDanger" size="sm" onClick={onRestartPi} className="text-[10px] font-bold tracking-wide">
                    <RotateCw size={13} />
                    PI
                </Button>
                <Button
                    variant="softPrimary"
                    size="sm"
                    onClick={onCheckUpdates}
                    disabled={isTransmitting}
                    className="text-[10px] font-bold tracking-wide"
                >
                    <RefreshCw size={13} />
                    UPDATE
                </Button>
            </div>
        </div>
    );
}

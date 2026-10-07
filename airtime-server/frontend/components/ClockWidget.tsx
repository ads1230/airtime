import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Badge } from './ui/badge';
import { RadioConfig, SystemStatus } from '../types';
import { RadioTower } from 'lucide-react';
import { fixedTimeShiftMs, formatOffset, formatUtcOffset, formatWallTime } from './piClock';
import { usePiClock } from '../hooks/usePiClock';

const formatTimeAgo = (seconds: number): string => {
    if (seconds < 0) return '--';
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

interface ClockWidgetProps {
    status: SystemStatus | null;
    radioConfig?: RadioConfig | null;
    timeTesterEnabled?: boolean;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({ status, radioConfig, timeTesterEnabled = false }) => {
    const { instant: displayTime, utcOffset: piUtcOffset, piTime } = usePiClock(status?.system_time, status?.received_at);
    const [countdown, setCountdown] = useState<number>(0);

    useEffect(() => {
        const intervalId = setInterval(() => setCountdown(prev => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (status?.services.txtempus_remaining_seconds) {
            setCountdown(status.services.txtempus_remaining_seconds);
        } else if (!status?.services.txtempus_running) {
            setCountdown(0);
        }
    }, [status]);

    // Takes a piWallClock date, which is only correct read in UTC.
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };

    const deviceUtcOffset = -displayTime.getTimezoneOffset();
    const zoneDiffers = piUtcOffset !== null && piUtcOffset !== deviceUtcOffset;

    const formatCountdown = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const isTransmitting = status?.services.txtempus_running;
    const serviceName = status?.services.txtempus_service || 'Unknown';

    // What is on air, as the daemon recorded it at the start; the settings may say otherwise.
    // txtempus gets a fixed time or an offset, never both, and a fixed time wins.
    const services = status?.services;
    const fixedTime = isTransmitting ? (services?.txtempus_fixed_time || null) : null;
    const isFixedTimeBroadcast = !!fixedTime && !timeTesterEnabled;

    const offset = isTransmitting && !fixedTime ? (services?.txtempus_offset || 0) : 0;
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? 1 : -1;
    const hasOffset = offset !== 0;

    // Between broadcasts, what the next one will carry, decided the way the daemon builds its command.
    const fixedConfigured = /^\d{1,2}:\d{2}$/.test(radioConfig?.default_fixed_time || '') && radioConfig?.default_time_mode === 'fixed_time'
        ? radioConfig.default_fixed_time!
        : null;
    const offsetConfigured = !fixedConfigured && (radioConfig?.default_time_mode === 'time_now_with_offset' || !!radioConfig?.default_offset_enabled)
        ? (radioConfig?.default_offset || 0)
        : 0;

    // The big clock shows the time a watch gets: on air, what the daemon recorded at
    // the start; otherwise what the settings would send. A fixed time that hasn't
    // started yet is shown standing still at the time it will start from.
    let broadcastTime: Date | null = null;
    let broadcastLabel = '';
    let broadcastDetail = '';
    let broadcastTone = 'text-testing-bright';
    if (piTime && isTransmitting && fixedTime) {
        const shift = fixedTimeShiftMs(services?.txtempus_started_at || '', fixedTime);
        if (shift !== null) {
            broadcastTime = new Date(piTime.getTime() + shift);
            broadcastLabel = 'Broadcast time';
            broadcastDetail = `fixed ${fixedTime}`;
        }
    } else if (piTime && !isTransmitting && fixedConfigured) {
        const [hour, minute] = fixedConfigured.split(':').map(Number);
        broadcastTime = new Date(Date.UTC(piTime.getUTCFullYear(), piTime.getUTCMonth(), piTime.getUTCDate(), hour, minute));
        broadcastLabel = 'Broadcast starts at';
    } else {
        const shiftMinutes = isTransmitting ? offset : offsetConfigured;
        if (piTime && shiftMinutes !== 0) {
            broadcastTime = new Date(piTime.getTime() + shiftMinutes * 60_000);
            broadcastLabel = 'Broadcast time';
            broadcastDetail = formatOffset(shiftMinutes);
            broadcastTone = shiftMinutes > 0 ? 'text-offset-positive' : 'text-offset-negative';
        }
    }
    const shownTime = broadcastTime ?? piTime;
    const showCurrentTime = !!broadcastTime && !!piTime && formatWallTime(broadcastTime) !== formatWallTime(piTime);

    // A Time Tester run or a fixed-time Broadcast reads as "testing"; everything
    // else is a normal on-air Broadcast.
    const useTesting = timeTesterEnabled || isFixedTimeBroadcast;
    const c = useTesting ? {
        border: 'border-testing/50',
        borderSolid: 'border-testing/80',
        text: 'text-testing',
        glow: 'glow-testing',
        ping: 'bg-testing-bright',
        logoGlow: 'glow-logo-testing',
        iconBg: 'bg-testing/10 text-testing-bright',
        countdown: 'text-testing-bright',
    } : {
        border: 'border-on-air/50',
        borderSolid: 'border-on-air/80',
        text: 'text-on-air',
        glow: 'glow-on-air',
        ping: 'bg-on-air-bright',
        logoGlow: 'glow-logo-on-air',
        iconBg: 'bg-on-air/10 text-on-air-bright',
        countdown: 'text-on-air-bright',
    };

    return (
        <Card className="group relative h-full overflow-hidden">
            <div className="flex h-full flex-col justify-between">
            <div className="z-10 mb-3 flex items-start justify-between">
                <div>
                    {broadcastLabel && (
                        <div className={`mb-1 text-[11px] font-bold tracking-wider ${broadcastTone}`}>
                            <span className="uppercase">{broadcastLabel}</span>
                            {broadcastDetail && <span className="ml-1.5 font-mono">{broadcastDetail}</span>}
                        </div>
                    )}
                    <div className="mb-1 font-mono text-4xl leading-none font-bold tracking-tight text-heading md:text-5xl">
                        {shownTime ? formatWallTime(shownTime) : '--:--:--'}
                    </div>
                    <div className="min-h-4 text-xs font-medium text-muted-foreground">
                        {shownTime && piUtcOffset !== null && `${formatDate(shownTime)} · ${formatUtcOffset(piUtcOffset)}`}
                    </div>
                    {showCurrentTime && piTime && (
                        <div className="mt-1.5 flex items-baseline gap-1.5 text-[11px] font-medium text-muted-foreground">
                            Current time
                            <span className="font-mono text-sm font-bold text-foreground">{formatWallTime(piTime)}</span>
                        </div>
                    )}
                    {zoneDiffers && (
                        <div className="mt-0.5 text-[11px] font-medium text-warning">
                            Time zone differs from this device ({formatUtcOffset(deviceUtcOffset)})
                        </div>
                    )}
                </div>

                {isTransmitting && (
                    <div className="animate-fade-in flex items-center gap-6 pt-2 pr-4">
                        <div className="relative hidden px-2 py-1 md:block md:px-4 md:py-1.5">
                            <div className={`absolute inset-0 animate-pulse rounded-md border-2 blur-sm ${c.border}`}></div>
                            <div className={`absolute inset-0 rounded-md border ${c.borderSolid}`}></div>
                            <span className={`relative z-10 text-xs font-black tracking-widest md:text-2xl ${c.text} ${c.glow}`}>
                                ON AIR
                            </span>
                        </div>

                        <div className="relative">
                            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 duration-1000 ${c.ping}`}></span>
                            <img
                                src="/airtime-logo.png"
                                alt="Broadcasting"
                                className={`relative z-10 h-12 w-12 object-contain ${c.logoGlow}`}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Kept in place but hidden between broadcasts, so starting one doesn't push the page down. */}
            <div className={`z-10 flex min-h-[50px] items-center border-t border-muted pt-3 ${isTransmitting ? '' : 'invisible'}`}>
                <div className={`flex w-full items-center justify-between ${isTransmitting ? 'animate-slide-up' : ''}`}>
                    <div className="flex items-center gap-2">
                        <div className={`rounded p-2 ${c.iconBg}`}>
                            <RadioTower size={32} />
                        </div>
                        <div>
                            <div className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">Transmitting</div>
                            <div className="flex items-center gap-2 text-2xl font-bold text-foreground">
                                {serviceName}
                                {timeTesterEnabled && (
                                    <Badge variant="testing" className="mt-0.5 ml-1 rounded-md border px-1.5 py-0 text-[9px] font-bold tracking-widest uppercase">
                                        Testing
                                    </Badge>
                                )}
                                {isFixedTimeBroadcast && (
                                    <Badge variant="testing" className="ml-1 rounded-md border px-2 py-0 font-mono text-[12px] font-bold">
                                        FIXED {fixedTime}
                                    </Badge>
                                )}
                                {!timeTesterEnabled && !isFixedTimeBroadcast && !hasOffset && (
                                    <Badge variant="onAir" className="ml-1 rounded-md border px-2 py-0 font-mono text-[12px] font-bold">
                                        NOW
                                    </Badge>
                                )}
                                {hasOffset && !timeTesterEnabled && !isFixedTimeBroadcast && (
                                    <Badge
                                        variant={offsetSign > 0 ? 'offsetPositive' : 'offsetNegative'}
                                        className="ml-1 rounded-md border px-2 py-0 font-mono text-[12px] font-bold"
                                    >
                                        NOW {offsetSign > 0 ? '+' : '-'}{offsetHours > 0 ? `${offsetHours}h ` : ''}{offsetMinutes}m
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">Remaining</div>
                        <div className={`mt-0.5 font-mono text-3xl leading-none font-bold drop-shadow-md ${c.countdown}`}>
                            {formatCountdown(countdown)}
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </Card>
    );
};

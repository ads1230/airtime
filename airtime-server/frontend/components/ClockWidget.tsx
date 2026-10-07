import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Badge } from './ui/badge';
import { SystemStatus } from '../types';
import { RadioTower } from 'lucide-react';
import { fixedTimeShiftMs, formatUtcOffset, parsePiClock, piWallClock } from './piClock';

const formatTimeAgo = (seconds: number): string => {
    if (seconds < 0) return '--';
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

interface ClockWidgetProps {
    status: SystemStatus | null;
    timeTesterEnabled?: boolean;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({ status, timeTesterEnabled = false }) => {
    const [displayTime, setDisplayTime] = useState<Date>(new Date());
    const [serverOffset, setServerOffset] = useState<number>(0);
    const [piUtcOffset, setPiUtcOffset] = useState<number | null>(null);
    const [initDone, setInitDone] = useState(false);
    const [countdown, setCountdown] = useState<number>(0);

    useEffect(() => {
        if (status?.system_time) {
            const clock = parsePiClock(status.system_time);
            if (clock) {
                setServerOffset(clock.instantMs - Date.now());
                setPiUtcOffset(clock.utcOffsetMinutes);
            }
            if (!initDone) setInitDone(true);
        }
    }, [status]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setDisplayTime(new Date(new Date().getTime() + serverOffset));
            setCountdown(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(intervalId);
    }, [serverOffset]);

    useEffect(() => {
        if (status?.services.txtempus_remaining_seconds) {
            setCountdown(status.services.txtempus_remaining_seconds);
        } else if (!status?.services.txtempus_running) {
            setCountdown(0);
        }
    }, [status]);

    // Both take a piWallClock date, which is only correct read in UTC.
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { timeZone: 'UTC', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };

    const piTime = piUtcOffset === null ? null : piWallClock(displayTime.getTime(), piUtcOffset);
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

    // The time a watch is being sent, when that isn't simply the Pi's clock.
    const broadcastShiftMs = fixedTime
        ? fixedTimeShiftMs(services?.txtempus_started_at || '', fixedTime)
        : (hasOffset ? offset * 60_000 : null);
    const broadcastTime = piTime && broadcastShiftMs !== null ? new Date(piTime.getTime() + broadcastShiftMs) : null;
    const broadcastOnOtherDay = !!broadcastTime && !!piTime && broadcastTime.getUTCDate() !== piTime.getUTCDate();
    const broadcastTone = fixedTime ? 'text-testing-bright' : (offsetSign > 0 ? 'text-offset-positive' : 'text-offset-negative');

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
                    <div className="mb-1 font-mono text-4xl leading-none font-bold tracking-tight text-heading md:text-5xl">
                        {piTime ? formatTime(piTime) : '--:--:--'}
                    </div>
                    <div className="min-h-4 text-xs font-medium text-muted-foreground">
                        {piTime && piUtcOffset !== null && `${formatDate(piTime)} · ${formatUtcOffset(piUtcOffset)}`}
                    </div>
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

            <div className="z-10 flex min-h-[50px] items-center border-t border-muted pt-3">
                {isTransmitting ? (
                    <div className="animate-slide-up flex w-full items-center justify-between">
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
                                {broadcastTime && (
                                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-medium text-muted-foreground">
                                        Broadcasting
                                        <span className={`font-mono text-sm font-bold ${broadcastTone}`}>{formatTime(broadcastTime)}</span>
                                        {broadcastOnOtherDay && (
                                            <span>{broadcastTime.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">Remaining</div>
                            <div className={`mt-0.5 font-mono text-3xl leading-none font-bold drop-shadow-md ${c.countdown}`}>
                                {formatCountdown(countdown)}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="w-full text-center text-lg font-medium tracking-wide text-subtle-foreground italic">
                        System Idle • Ready to Broadcast
                    </div>
                )}
            </div>
            </div>
        </Card>
    );
};

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Badge } from './ui/badge';
import { RadioConfig, SystemStatus } from '../types';
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
    // The service, duration and broadcast button, at the foot of the card.
    actions?: React.ReactNode;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({ status, radioConfig, timeTesterEnabled = false, actions }) => {
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
        ping: 'bg-testing-bright',
        logoGlow: 'glow-logo-testing',
        countdown: 'text-testing-bright',
    } : {
        ping: 'bg-on-air-bright',
        logoGlow: 'glow-logo-on-air',
        countdown: 'text-on-air-bright',
    };

    // What is on air and for how long: beside the logo on a wide screen, in a strip
    // above the controls on a phone, where there is no room beside the logo. The time
    // mode is not repeated here; the label over the big clock gives the offset or fixed time.
    const transmitting = (
        <div>
            <div className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">Transmitting</div>
            <div className="flex items-center gap-2 text-2xl font-bold text-foreground">
                {serviceName}
                {timeTesterEnabled && (
                    <Badge variant="testing" className="mt-0.5 rounded-md border px-1.5 py-0 text-[9px] font-bold tracking-widest uppercase">
                        Testing
                    </Badge>
                )}
            </div>
        </div>
    );

    // As wide as the countdown was at the start, so it narrowing at 59:59 or 9:59
    // doesn't shift Transmitting beside it.
    const countdownWidth = `${formatCountdown(Math.max(countdown, (services?.txtempus_duration || 0) * 60)).length}ch`;
    const remaining = (
        <div className="shrink-0 text-right">
            <div className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">Remaining</div>
            <div className={`mt-0.5 font-mono text-3xl leading-none font-bold drop-shadow-md ${c.countdown}`} style={{ minWidth: countdownWidth }}>
                {formatCountdown(countdown)}
            </div>
        </div>
    );

    return (
        <Card className="group relative h-full overflow-hidden">
            <div className="flex h-full flex-col">
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

                {/* Also held in place between broadcasts: on a narrow phone it takes width
                    from the date beside it, which must wrap the same way on and off air. */}
                <div className={`flex shrink-0 items-center gap-6 pt-2 pr-4 ${isTransmitting ? 'animate-fade-in' : 'invisible'}`}>
                    <div className="hidden items-center gap-6 md:flex">
                        {transmitting}
                        {remaining}
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
            </div>

            <div className="z-10 mt-auto">
                {/* Phones only. Kept in place but hidden between broadcasts, so starting
                    one moves neither the broadcast button nor the rest of the page. */}
                <div className={`flex min-h-[50px] items-center border-t border-muted pt-3 md:hidden ${isTransmitting ? '' : 'invisible'}`}>
                    <div className={`flex w-full items-center justify-between ${isTransmitting ? 'animate-slide-up' : ''}`}>
                        {transmitting}
                        {remaining}
                    </div>
                </div>

                {actions && <div className="mt-3">{actions}</div>}
            </div>
            </div>
        </Card>
    );
};

import React from 'react';
import { SystemMetrics, SystemStatus } from '../types';
import { Card } from './Card';
import { Thermometer, Cpu, CircuitBoard, Clock, Globe, Radio } from 'lucide-react';
import { formatClockOffset } from './clockOffset';

const formatTimeAgo = (seconds: number): string => {
    if (seconds < 0) return '--';
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

interface Props {
    metrics: SystemMetrics | null;
    status: SystemStatus | null;
}

interface UsageRingProps {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    percent: number;
    // A text colour class; the ring and the icon draw in it.
    colorClass: string;
}

// A percentage as a large ring: the arc fills clockwise from twelve o'clock over a
// faint track in the same colour, with the value and its label in the middle.
function UsageRing({ icon: Icon, label, percent, colorClass }: UsageRingProps) {
    const value = Math.min(100, Math.max(0, percent));
    return (
        <div
            role="meter"
            aria-label={`${label} usage`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            aria-valuetext={`${value.toFixed(1)}%`}
            className="relative aspect-square w-full max-w-[152px]"
        >
            <svg viewBox="0 0 100 100" className={`absolute inset-0 h-full w-full ${colorClass}`} aria-hidden="true">
                <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="8" opacity="0.18" />
                {/* pathLength 100 makes the dash length the percentage. Left out at zero,
                    where its round caps would still draw a dot. */}
                {value > 0 && (
                    <circle
                        cx="50" cy="50" r="44"
                        fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                        pathLength={100}
                        strokeDasharray={`${value} 100`}
                        transform="rotate(-90 50 50)"
                        className="transition-[stroke-dasharray] duration-500 ease-out"
                    />
                )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-mono font-bold text-foreground">
                    <span className="text-3xl">{value.toFixed(1)}</span>
                    <span className="text-base">%</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <Icon size={14} className={colorClass} /> {label}
                </div>
            </div>
        </div>
    );
}

export function PerformanceWidget({ metrics, status }: Props) {
    if (!metrics) {
        return (
            <Card title="System Performance">
                <div className="flex h-32 animate-pulse items-center justify-center text-faint-foreground">
                    Loading...
                </div>
            </Card>
        );
    }

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${minutes}m`;
    };


    const getTempColor = (temp: number) => {
        if (temp < 50) return 'text-success';
        if (temp < 70) return 'text-offset-negative';
        return 'text-danger';
    };

    return (
        <Card title="System Statistics" className="h-full">
            {/* Beside the taller System Control card, the readings drop to the foot so
                the spare height sits between them and the rings. */}
            <div className="flex h-full flex-col justify-between gap-6">
                <div className="grid grid-cols-2 justify-items-center gap-4">
                    <UsageRing icon={Cpu} label="CPU" percent={metrics.cpu.percent} colorClass="text-meter-cpu" />
                    <UsageRing icon={CircuitBoard} label="RAM" percent={metrics.memory.percent} colorClass="text-meter-ram" />
                </div>

                {/* Values stay on one line; a phone gets tighter gaps so they fit. */}
                <div className="grid grid-cols-4 gap-2 sm:gap-4">
                    <div className="flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Thermometer size={14} /> TEMP
                        </div>
                        <div className={`font-mono text-sm font-bold whitespace-nowrap ${getTempColor(metrics.temperature)}`}>
                            {metrics.temperature > 0 ? `${metrics.temperature.toFixed(1)}°C` : 'N/A'}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Radio size={14} /> NTP SYNC
                        </div>
                        <div className={`font-mono text-sm font-bold whitespace-nowrap ${status?.ntp_status.synced ? 'text-success' : 'text-danger'}`}>
                            {status?.ntp_status.synced
                                ? formatTimeAgo(status.ntp_status.last_rx_seconds || 0)
                                : 'NO SYNC'}
                        </div>
                        {status?.ntp_status.synced && status.ntp_status.offset_ms != null && (
                            <div
                                className="-mt-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground"
                                title="How far the Pi's clock was from its time server at the last check"
                            >
                                ±{formatClockOffset(status.ntp_status.offset_ms)}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Globe size={14} /> PING
                        </div>
                        <div className={`font-mono text-sm font-bold whitespace-nowrap ${status?.internet_status.connected ? 'text-on-air-bright' : 'text-danger'}`}>
                            {status?.internet_status.connected
                                ? `${Math.round(status.internet_status.ping_ms)}ms`
                                : 'OFFLINE'}
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 text-right">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Clock size={14} /> UPTIME
                        </div>
                        <div className="font-mono text-xs font-bold whitespace-nowrap text-foreground">
                            {formatUptime(metrics.uptime)}
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}

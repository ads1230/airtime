import { useState } from 'react';
import { Server } from 'lucide-react';
import { TimeServerInfo } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

interface Preset {
    id: string;
    label: string;
    detail: string;
    servers: string[];
}

// National labs run stratum 1 servers fed straight from their atomic clocks; pick the nearest.
export const TIME_SERVER_PRESETS: Preset[] = [
    { id: 'default', label: 'Raspberry Pi default', detail: 'The Debian NTP pool, servers chosen by DNS.', servers: [] },
    { id: 'npl', label: 'NPL · UK', detail: "UK national time, from NPL's atomic clocks.", servers: ['ntp1.npl.co.uk', 'ntp4.npl.co.uk', 'ntp5.npl.co.uk'] },
    { id: 'ptb', label: 'PTB · Germany', detail: "German national time, from PTB's atomic clocks.", servers: ['ptbtime1.ptb.de', 'ptbtime2.ptb.de', 'ptbtime4.ptb.de'] },
    { id: 'nist', label: 'NIST · USA', detail: "US national time, from NIST's atomic clocks.", servers: ['time.nist.gov'] },
    { id: 'nict', label: 'NICT · Japan', detail: "Japanese national time, from NICT's atomic clocks.", servers: ['ntp.nict.jp'] },
];

const sameServers = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function presetFor(servers: string[]): Preset | undefined {
    return TIME_SERVER_PRESETS.find((preset) => sameServers(preset.servers, servers));
}

export function describeTimeServers(servers: string[]): string {
    return presetFor(servers)?.label ?? servers.join(', ');
}

function describeSource(info: TimeServerInfo, syncing: boolean): string {
    if (info.current) {
        const offset = Math.abs(info.current.offset_ms);
        return `In use: ${info.current.name} · stratum ${info.current.stratum} · within ${offset < 10 ? offset.toFixed(1) : offset.toFixed(0)} ms`;
    }
    return syncing ? 'Waiting for chrony to pick a server…' : 'Not synced to a server yet.';
}

interface TimeServerModalProps {
    info: TimeServerInfo;
    syncing: boolean;
    onApply: (servers: string[]) => Promise<void>;
    onClose: () => void;
}

export function TimeServerModal({ info, syncing, onApply, onClose }: TimeServerModalProps) {
    const initial = presetFor(info.servers);
    const [selected, setSelected] = useState(initial?.id ?? 'custom');
    const [custom, setCustom] = useState(initial ? '' : info.servers.join(' '));
    const [applying, setApplying] = useState(false);
    const [failed, setFailed] = useState(false);

    const chosen = selected === 'custom'
        ? custom.split(/[\s,]+/).filter(Boolean)
        : TIME_SERVER_PRESETS.find((preset) => preset.id === selected)?.servers ?? [];
    const unchanged = sameServers(chosen, info.servers);
    const busy = applying || syncing;

    const apply = async () => {
        setApplying(true);
        setFailed(false);
        try {
            await onApply(chosen);
        } catch (e) {
            console.error('Failed to change the time server', e);
            setFailed(true);
        } finally {
            setApplying(false);
        }
    };

    const setupCommand = `sudo mkdir -p ${info.source_dir} && echo 'sourcedir ${info.source_dir}' | sudo tee -a /etc/chrony/chrony.conf && sudo systemctl restart chrony`;
    const option = (id: string, label: string, detail: string) => (
        <button
            key={id}
            onClick={() => setSelected(id)}
            disabled={busy}
            className={`w-full rounded-lg border-2 px-3 py-2 text-left transition-colors ${selected === id ? 'border-on-air bg-on-air/10' : 'border-border bg-surface-sunken/50 hover:border-secondary'}`}
        >
            <div className={`text-sm font-semibold ${selected === id ? 'text-on-air-bright' : 'text-foreground'}`}>{label}</div>
            <div className="text-[11px] leading-snug text-subtle-foreground">{detail}</div>
        </button>
    );

    return (
        <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
            <DialogContent className="max-w-sm gap-0 p-0">
                <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-border p-4">
                    <div className="rounded-full bg-on-air/20 p-1.5 text-on-air-bright">
                        <Server size={16} />
                    </div>
                    <DialogTitle className="text-base font-bold text-heading">Time Server</DialogTitle>
                </DialogHeader>

                <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
                    <DialogDescription className="text-[11px] leading-relaxed text-subtle-foreground">
                        The Pi sets its clock from these servers, and every broadcast is only as accurate as that clock.
                    </DialogDescription>
                    <div className="rounded-md bg-surface-sunken/60 px-3 py-2 font-mono text-[11px] text-foreground">
                        {describeSource(info, syncing)}
                    </div>

                    {!info.ready && (
                        <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-foreground">
                            <div>
                                Chrony needs a one-time change before AirTime can choose its servers. Run this on the Pi, then reopen this window:
                            </div>
                            <code className="block rounded bg-surface-sunken/80 p-2 font-mono text-[10px] break-all text-warning">{setupCommand}</code>
                        </div>
                    )}

                    {TIME_SERVER_PRESETS.map((preset) => option(preset.id, preset.label, preset.detail))}
                    {option('custom', 'Custom', 'Your own servers, e.g. za.pool.ntp.org.')}
                    {selected === 'custom' && (
                        <Input
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            disabled={busy}
                            placeholder="Host names, separated by spaces"
                            aria-label="Custom time servers"
                            className="bg-surface-sunken/80 font-mono"
                        />
                    )}
                </div>

                <div className="space-y-2 border-t border-border p-4">
                    {failed && <div className="text-center text-[11px] text-danger">Couldn't change the time server. Check the names and try again.</div>}
                    <Button
                        variant="secondary"
                        onClick={apply}
                        disabled={!info.ready || busy || unchanged || (selected === 'custom' && chosen.length === 0)}
                        className="w-full font-bold"
                    >
                        {syncing ? 'Waiting for chrony…' : applying ? 'Applying…' : 'Apply'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

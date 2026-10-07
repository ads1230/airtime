import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { TimeServerInfo } from '../types';

const SYNC_POLLS = 15;
const SYNC_POLL_MS = 2000;

export function useTimeServers() {
    const [info, setInfo] = useState<TimeServerInfo | null>(null);
    const [syncing, setSyncing] = useState(false);

    const load = async () => {
        try {
            setInfo(await api.getTimeServers());
        } catch (e) {
            console.error('Could not read the time servers', e);
        }
    };

    useEffect(() => {
        load();
    }, []);

    // Applying restarts chrony, so poll until it has picked a source again.
    const apply = async (servers: string[]) => {
        const applied = await api.setTimeServers(servers);
        setInfo((previous) => previous && { ...previous, servers: applied.servers, current: null });
        setSyncing(true);
        try {
            for (let poll = 0; poll < SYNC_POLLS; poll++) {
                await new Promise((resolve) => setTimeout(resolve, SYNC_POLL_MS));
                const next = await api.getTimeServers().catch(() => null);
                if (!next) continue;
                setInfo(next);
                if (next.current && (next.servers.length === 0 || next.servers.includes(next.current.name))) break;
            }
        } finally {
            setSyncing(false);
        }
    };

    return { info, syncing, reload: load, apply };
}

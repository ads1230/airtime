import { useState } from 'react';
import { api } from '../services/api';
import { RadioConfig } from '../types';
import { useBroadcastSettings } from './useBroadcastSettings';
import { useTimeTester } from './useTimeTester';

interface Callbacks {
    onSettingsSaved?: () => void;
    // After a broadcast is started or stopped, so the status can catch up.
    onToggled: () => void;
    onTimeTesterChange?: (enabled: boolean, standard: string) => void;
}

// Shared by the clock card, which starts and stops broadcasts, and the control
// card, which holds the service, time settings and tester.
export function useBroadcastControl(radioConfig: RadioConfig | null, isTransmitting: boolean, callbacks: Callbacks) {
    const settings = useBroadcastSettings(radioConfig, callbacks.onSettingsSaved);
    const tester = useTimeTester(callbacks.onTimeTesterChange);
    const [busy, setBusy] = useState(false);

    const toggle = async () => {
        setBusy(true);
        try {
            if (!isTransmitting) {
                await api.transmit({ service: settings.standard, duration: settings.duration });
            } else if (tester.enabled) {
                // The tester has its own stop path, which restores the schedules
                // it suspended.
                await tester.stop();
            } else {
                await api.stopTransmit();
            }
            callbacks.onToggled();
        } catch (e) {
            console.error('Broadcast control failed', e);
        } finally {
            setBusy(false);
        }
    };

    return { settings, tester, busy, toggle };
}

export type BroadcastSettings = ReturnType<typeof useBroadcastSettings>;
export type TimeTester = ReturnType<typeof useTimeTester>;

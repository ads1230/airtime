import { useEffect, useState } from 'react';
import { Card } from './Card';
import { RadioConfig, TimeZoneInfo } from '../types';
import { api } from '../services/api';
import { ConfirmModal, ModalType } from './ConfirmModal';
import { RestartOverlay } from './RestartOverlay';
import { SystemControlPanel } from './control/SystemControlPanel';
import { TimeSettingsModal } from './control/TimeSettingsModal';
import { TimeTesterModal } from './control/TimeTesterModal';
import { TimeZoneModal } from './control/TimeZoneModal';
import { TimeServerModal, describeTimeServers } from './control/TimeServerModal';
import { useTimeServers } from '../hooks/useTimeServers';
import { BroadcastSettings, TimeTester, availableStandards } from '../hooks/useBroadcastControl';
import { useSystemActions } from '../hooks/useSystemActions';

interface ControlWidgetProps {
    radioConfig: RadioConfig | null;
    // Shared with the clock card, which holds the service, duration and broadcast button.
    settings: BroadcastSettings;
    tester: TimeTester;
    systemTime?: string;
    systemTimeReceivedAt?: number;
    onBroadcastStart: () => void;
    onCheckUpdates: () => void;
    isTransmitting?: boolean;
}

interface Prompt {
    title: string;
    message: string;
    type: ModalType;
    confirmText?: string;
    onConfirm?: () => void;
}

export function ControlWidget({
    radioConfig,
    settings,
    tester,
    systemTime,
    systemTimeReceivedAt,
    onBroadcastStart,
    onCheckUpdates,
    isTransmitting = false,
}: ControlWidgetProps) {
    const system = useSystemActions();

    const [ledsEnabled, setLedsEnabled] = useState(true);
    const [showTimeSettings, setShowTimeSettings] = useState(false);
    const [showTimeTester, setShowTimeTester] = useState(false);
    const [timeZone, setTimeZone] = useState<TimeZoneInfo | null>(null);
    const [showTimeZone, setShowTimeZone] = useState(false);
    const timeServers = useTimeServers();
    const [showTimeServer, setShowTimeServer] = useState(false);
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const standards = availableStandards(radioConfig);

    useEffect(() => {
        api.getTimeZone()
            .then(setTimeZone)
            .catch((e) => console.error('Could not read the time zone', e));
    }, []);

    const applyTimeZone = async (zone: string) => {
        setShowTimeZone(false);
        try {
            await system.restartWith(() => api.setTimeZone(zone));
        } catch (e) {
            console.error('Failed to change the time zone', e);
            setPrompt({ title: 'Error', message: 'Failed to change the time zone.', type: 'danger' });
        }
    };

    const toggleLeds = async () => {
        try {
            const res = await api.toggleStealth();
            setLedsEnabled(!res.stealth_mode);
        } catch (e) {
            console.error('Failed to toggle the LEDs', e);
        }
    };

    const confirmRestart = (target: 'service' | 'pi') => {
        setPrompt(target === 'pi'
            ? {
                title: 'Reboot System',
                message: 'Reboot the Raspberry Pi? The system will be offline for roughly a minute.',
                type: 'danger',
                confirmText: 'Reboot',
                onConfirm: () => system.restart('pi'),
            }
            : {
                title: 'Restart AirTime',
                message: 'Restart AirTime? Any active broadcast will be interrupted.',
                type: 'warning',
                confirmText: 'Restart',
                onConfirm: () => system.restart('service'),
            });
    };

    return (
        <>
            <Card title="System Control" className="h-full">
                <div className="-mt-2">
                    <SystemControlPanel
                        ledsEnabled={ledsEnabled}
                        isTransmitting={isTransmitting}
                        timeMode={settings.timeMode}
                        fixedTime={settings.fixedTime}
                        offsetEnabled={settings.offsetEnabled}
                        offsetHours={settings.offsetHours}
                        offsetMinutes={settings.offsetMinutes}
                        offsetSign={settings.offsetSign}
                        timeZone={timeZone?.timezone ?? null}
                        timeServer={timeServers.info ? describeTimeServers(timeServers.info.servers) : null}
                        onToggleLeds={toggleLeds}
                        onOpenTimeSettings={() => {
                            if (isTransmitting) {
                                setPrompt({
                                    title: 'Control Locked',
                                    message: "You can't change time settings while broadcasting.",
                                    type: 'warning',
                                });
                                return;
                            }
                            setShowTimeSettings(true);
                        }}
                        onOpenTimeZone={() => {
                            if (isTransmitting) {
                                setPrompt({
                                    title: 'Control Locked',
                                    message: "You can't change the time zone while broadcasting.",
                                    type: 'warning',
                                });
                                return;
                            }
                            setShowTimeZone(true);
                        }}
                        onOpenTimeServer={() => {
                            if (isTransmitting) {
                                setPrompt({
                                    title: 'Control Locked',
                                    message: "You can't change the time server while broadcasting.",
                                    type: 'warning',
                                });
                                return;
                            }
                            timeServers.reload();
                            setShowTimeServer(true);
                        }}
                        onRestartService={() => confirmRestart('service')}
                        onRestartPi={() => confirmRestart('pi')}
                        onCheckUpdates={onCheckUpdates}
                        onOpenTimeTester={() => {
                            if (isTransmitting) {
                                setPrompt({
                                    title: 'Control Locked',
                                    message: "You can't start the Time Tester while broadcasting.",
                                    type: 'warning',
                                });
                                return;
                            }
                            setShowTimeTester(true);
                        }}
                    />
                </div>
            </Card>

            {showTimeSettings && (
                <TimeSettingsModal
                    systemTime={systemTime}
                    systemTimeReceivedAt={systemTimeReceivedAt}
                    timeMode={settings.timeMode}
                    fixedTime={settings.fixedTime}
                    offsetHours={settings.offsetHours}
                    offsetMinutes={settings.offsetMinutes}
                    offsetSign={settings.offsetSign}
                    saving={settings.saving}
                    onTimeModeChange={settings.setTimeMode}
                    onFixedTimeChange={settings.setFixedTime}
                    onOffsetSignChange={settings.setOffsetSign}
                    onClose={() => setShowTimeSettings(false)}
                    onSave={async (hours, minutes) => {
                        const saved = await settings.saveTimeMode(hours, minutes);
                        if (saved) {
                            setShowTimeSettings(false);
                            return;
                        }
                        setPrompt({ title: 'Error', message: 'Failed to save time settings.', type: 'danger' });
                    }}
                />
            )}

            {showTimeZone && timeZone && (
                <TimeZoneModal
                    current={timeZone.timezone}
                    zones={timeZone.available}
                    onSave={applyTimeZone}
                    onClose={() => setShowTimeZone(false)}
                />
            )}

            {showTimeServer && timeServers.info && (
                <TimeServerModal
                    info={timeServers.info}
                    syncing={timeServers.syncing}
                    onApply={timeServers.apply}
                    onClose={() => setShowTimeServer(false)}
                />
            )}

            {showTimeTester && (
                <TimeTesterModal
                    standards={standards}
                    standard={tester.standard}
                    durationHours={tester.durationHours}
                    busy={tester.busy}
                    onStandardChange={tester.setStandard}
                    onDurationChange={tester.setDurationHours}
                    onClose={() => setShowTimeTester(false)}
                    onStart={async () => {
                        if (await tester.start()) {
                            setShowTimeTester(false);
                            onBroadcastStart();
                        }
                    }}
                />
            )}

            {system.restarting && (
                <RestartOverlay
                    title={system.restarting === 'pi' ? 'Rebooting Pi' : 'Restarting AirTime'}
                    message={system.restarting === 'pi'
                        ? 'Waiting for the Raspberry Pi to come back online. This may take up to a minute.'
                        : 'Waiting for the daemon to restart. This should only take a few seconds.'}
                    hint="Polling for connection"
                />
            )}

            <ConfirmModal
                isOpen={prompt !== null}
                onClose={() => setPrompt(null)}
                onConfirm={prompt?.onConfirm}
                title={prompt?.title ?? ''}
                message={prompt?.message ?? ''}
                type={prompt?.type ?? 'info'}
                confirmText={prompt?.confirmText}
            />
        </>
    );
}

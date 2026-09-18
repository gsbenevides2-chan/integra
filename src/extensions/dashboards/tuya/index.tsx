import { useCallback, useEffect, useRef, useState } from "react";
import { HomeIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "core/ui/components/button";
import { Drawer } from "core/ui/components/drawer";
import { Input } from "core/ui/components/input";
import { Select } from "core/ui/components/select";
import { useToast } from "core/ui/components/toast";
import type { DashboardData } from "core/ui/createDashboard";
import { getTuyaEdenClient } from "extensions/scripts/tuya/client";
import { ApplyPresetModal } from "./component/applyPresetModal";
import { DeviceCard } from "./component/deviceCard";
import { DeviceDrawerContent } from "./component/deviceDrawerContent";
import { Modal } from "./component/modal";
import { PresetCard } from "./component/presetCard";
import { PresetDrawerContent } from "./component/presetDrawerContent";
import {
    EMPTY_PRESET_DRAFT,
    PresetForm,
    presetDraftToBody,
    type PresetDraft,
} from "./component/presetForm";
import { SensorCard } from "./component/sensorCard";
import { SensorDrawerContent } from "./component/sensorDrawerContent";
import type { Device, DeviceCommand, DeviceState, Preset, Sensor, DeviceKind } from "./types";

const POLL_INTERVAL_MS = 5000;

interface NewDeviceDraft {
    name: string;
    tuyaDeviceId: string;
    kind: DeviceKind;
    channelCount: string;
}

const EMPTY_DEVICE_DRAFT: NewDeviceDraft = {
    name: "",
    tuyaDeviceId: "",
    kind: "lamp",
    channelCount: "",
};

function NewDeviceForm({
    isOpen,
    onCreated,
    onClose,
}: {
    isOpen: boolean;
    onCreated: () => void;
    onClose: () => void;
}) {
    const { showToast } = useToast();
    const [draft, setDraft] = useState<NewDeviceDraft>(EMPTY_DEVICE_DRAFT);
    const [isSaving, setIsSaving] = useState(false);

    const submit = useCallback(async () => {
        if (!draft.name || !draft.tuyaDeviceId) {
            showToast("Preencha nome e device ID", "error");
            return;
        }
        setIsSaving(true);
        const { error } = await getTuyaEdenClient().tuya.devices.post({
            name: draft.name,
            tuyaDeviceId: draft.tuyaDeviceId,
            kind: draft.kind,
            channelCount: draft.channelCount ? Number(draft.channelCount) : null,
        });
        setIsSaving(false);
        if (error) {
            showToast("Falha ao cadastrar o dispositivo", "error");
            return;
        }
        showToast("Dispositivo cadastrado", "success");
        setDraft(EMPTY_DEVICE_DRAFT);
        onCreated();
        onClose();
    }, [draft, showToast, onCreated, onClose]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Novo dispositivo">
            <div className="flex flex-col gap-2">
                <Input
                    label="Nome"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <Input
                    label="Device ID (Tuya)"
                    value={draft.tuyaDeviceId}
                    onChange={(e) => setDraft({ ...draft, tuyaDeviceId: e.target.value })}
                />
                <Select
                    label="Tipo"
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as DeviceKind })}
                    options={[
                        { label: "Lâmpada", value: "lamp" },
                        { label: "Interruptor", value: "switch" },
                    ]}
                />
                {draft.kind === "switch" && (
                    <Input
                        label="Quantidade de canais"
                        value={draft.channelCount}
                        onChange={(e) => setDraft({ ...draft, channelCount: e.target.value })}
                    />
                )}
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button onClick={submit} isLoading={isSaving}>
                    Cadastrar
                </Button>
            </div>
        </Modal>
    );
}

interface NewSensorDraft {
    name: string;
    tuyaDeviceId: string;
}

const EMPTY_SENSOR_DRAFT: NewSensorDraft = { name: "", tuyaDeviceId: "" };

function NewSensorForm({
    isOpen,
    onCreated,
    onClose,
}: {
    isOpen: boolean;
    onCreated: () => void;
    onClose: () => void;
}) {
    const { showToast } = useToast();
    const [draft, setDraft] = useState<NewSensorDraft>(EMPTY_SENSOR_DRAFT);
    const [isSaving, setIsSaving] = useState(false);

    const submit = useCallback(async () => {
        if (!draft.name || !draft.tuyaDeviceId) {
            showToast("Preencha nome e device ID", "error");
            return;
        }
        setIsSaving(true);
        const { error } = await getTuyaEdenClient().tuya.sensors.post(draft);
        setIsSaving(false);
        if (error) {
            showToast("Falha ao cadastrar o sensor", "error");
            return;
        }
        showToast("Sensor cadastrado", "success");
        setDraft(EMPTY_SENSOR_DRAFT);
        onCreated();
        onClose();
    }, [draft, showToast, onCreated, onClose]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Novo sensor">
            <div className="flex flex-col gap-2">
                <Input
                    label="Nome"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <Input
                    label="Device ID (Tuya)"
                    value={draft.tuyaDeviceId}
                    onChange={(e) => setDraft({ ...draft, tuyaDeviceId: e.target.value })}
                />
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button onClick={submit} isLoading={isSaving}>
                    Cadastrar
                </Button>
            </div>
        </Modal>
    );
}

function NewPresetForm({
    isOpen,
    onCreated,
    onClose,
}: {
    isOpen: boolean;
    onCreated: () => void;
    onClose: () => void;
}) {
    const { showToast } = useToast();
    const [draft, setDraft] = useState<PresetDraft>(EMPTY_PRESET_DRAFT);
    const [isSaving, setIsSaving] = useState(false);

    const submit = useCallback(async () => {
        if (!draft.name) {
            showToast("Dê um nome ao modo", "error");
            return;
        }
        setIsSaving(true);
        const { error } = await getTuyaEdenClient().tuya.presets.post(presetDraftToBody(draft));
        setIsSaving(false);
        if (error) {
            showToast("Falha ao cadastrar o modo", "error");
            return;
        }
        showToast("Modo cadastrado", "success");
        setDraft(EMPTY_PRESET_DRAFT);
        onCreated();
        onClose();
    }, [draft, showToast, onCreated, onClose]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Novo modo">
            <PresetForm draft={draft} onChange={setDraft} />
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button onClick={submit} isLoading={isSaving}>
                    Cadastrar
                </Button>
            </div>
        </Modal>
    );
}

function Dashboard() {
    const { showToast } = useToast();
    const [devices, setDevices] = useState<Device[]>([]);
    const [sensors, setSensors] = useState<Sensor[]>([]);
    const [presets, setPresets] = useState<Preset[]>([]);
    const [openSensorId, setOpenSensorId] = useState<string | null>(null);
    const [showHidden, setShowHidden] = useState(false);
    const [showHiddenDevices, setShowHiddenDevices] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [busyDeviceIds, setBusyDeviceIds] = useState<string[]>([]);
    const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);
    const [openPresetId, setOpenPresetId] = useState<string | null>(null);
    const [applyPresetId, setApplyPresetId] = useState<string | null>(null);
    const [showNewDeviceForm, setShowNewDeviceForm] = useState(false);
    const [showNewSensorForm, setShowNewSensorForm] = useState(false);
    const [showNewPresetForm, setShowNewPresetForm] = useState(false);

    // A command is answered by the device itself, so a poll landing mid-flight would
    // overwrite the optimistic value with a reading taken before the change.
    const inFlight = useRef(new Set<string>());

    const fetchAll = useCallback(async (useLoading: boolean) => {
        if (useLoading) setIsLoading(true);
        const client = getTuyaEdenClient();
        const [devicesRes, sensorsRes, presetsRes] = await Promise.all([
            client.tuya.devices.get({ query: { includeHidden: "true" } }),
            client.tuya.sensors.get({ query: { includeHidden: "true" } }),
            client.tuya.presets.get(),
        ]);
        if (devicesRes.data) {
            const fresh = devicesRes.data as unknown as Device[];
            setDevices((current) =>
                fresh.map((device) =>
                    inFlight.current.has(device.id)
                        ? (current.find((item) => item.id === device.id) ?? device)
                        : device,
                ),
            );
        }
        if (sensorsRes.data) setSensors(sensorsRes.data as unknown as Sensor[]);
        if (presetsRes.data) setPresets(presetsRes.data as unknown as Preset[]);
        if (useLoading) setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchAll(true);
        const interval = setInterval(() => fetchAll(false), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const applyState = useCallback((deviceId: string, state: Partial<DeviceState>) => {
        setDevices((current) =>
            current.map((device) =>
                device.id === deviceId
                    ? { ...device, state: { ...device.state, ...state } }
                    : device,
            ),
        );
    }, []);

    const sendCommand = useCallback(
        async (device: Device, command: DeviceCommand) => {
            const previous = device.state;
            applyState(device.id, command as Partial<DeviceState>);
            setBusyDeviceIds((current) => [...current, device.id]);
            inFlight.current.add(device.id);

            const client = getTuyaEdenClient();
            const { data, error } = await client.tuya
                .devices({ id: device.id })
                .command.post(command);

            setBusyDeviceIds((current) => current.filter((id) => id !== device.id));
            inFlight.current.delete(device.id);

            if (error || !data) {
                applyState(device.id, previous);
                showToast(`Falha ao comandar "${device.name}"`, "error");
                return;
            }
            applyState(device.id, data as unknown as DeviceState);
        },
        [applyState, showToast],
    );

    const openDevice = devices.find((device) => device.id === openDeviceId) ?? null;
    const visibleDevices = devices.filter((device) => !device.hidden);
    const hiddenDevices = devices.filter((device) => device.hidden);
    const shownDevices = showHiddenDevices ? devices : visibleDevices;
    const visibleLamps = visibleDevices.filter((device) => device.kind === "lamp");
    const visibleSwitches = visibleDevices.filter((device) => device.kind === "switch");
    const shownLamps = shownDevices.filter((device) => device.kind === "lamp");
    const shownSwitches = shownDevices.filter((device) => device.kind === "switch");
    const openPreset = presets.find((preset) => preset.id === openPresetId) ?? null;
    const applyPreset = presets.find((preset) => preset.id === applyPresetId) ?? null;
    const openSensor = sensors.find((sensor) => sensor.id === openSensorId) ?? null;
    const visibleSensors = sensors.filter((sensor) => !sensor.hidden);
    const hiddenSensors = sensors.filter((sensor) => sensor.hidden);
    const shownSensors = showHidden ? sensors : visibleSensors;

    return (
        <div className="p-3 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-xl">Casa</h1>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setShowNewPresetForm(true)}>
                        <PlusIcon className="size-4" /> Novo modo
                    </Button>
                    <Button variant="secondary" onClick={() => setShowNewSensorForm(true)}>
                        <PlusIcon className="size-4" /> Novo sensor
                    </Button>
                    <Button variant="secondary" onClick={() => setShowNewDeviceForm(true)}>
                        <PlusIcon className="size-4" /> Novo dispositivo
                    </Button>
                </div>
            </div>

            <NewDeviceForm
                isOpen={showNewDeviceForm}
                onCreated={() => fetchAll(false)}
                onClose={() => setShowNewDeviceForm(false)}
            />
            <NewSensorForm
                isOpen={showNewSensorForm}
                onCreated={() => fetchAll(false)}
                onClose={() => setShowNewSensorForm(false)}
            />
            <NewPresetForm
                isOpen={showNewPresetForm}
                onCreated={() => fetchAll(false)}
                onClose={() => setShowNewPresetForm(false)}
            />

            {isLoading ? (
                <p className="text-sm text-mist-400">Carregando...</p>
            ) : (
                <>
                    <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-mist-300">
                                Iluminação ({visibleLamps.length})
                            </h2>
                            {hiddenDevices.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowHiddenDevices((current) => !current)}
                                    className="text-xs text-mist-400 hover:text-mist-300 cursor-pointer underline underline-offset-2"
                                >
                                    {showHiddenDevices
                                        ? "Esconder ocultas"
                                        : `Mostrar ocultas (${hiddenDevices.length})`}
                                </button>
                            )}
                        </div>
                        {shownLamps.length === 0 ? (
                            <p className="text-sm text-mist-400">
                                {hiddenDevices.length > 0
                                    ? "Todas as lâmpadas estão ocultas."
                                    : "Nenhuma lâmpada ainda. Cadastre uma pelo device ID da Tuya."}
                            </p>
                        ) : (
                            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                                {shownLamps.map((device) => (
                                    <DeviceCard
                                        key={device.id}
                                        device={device}
                                        isBusy={busyDeviceIds.includes(device.id)}
                                        onCommand={(command) => sendCommand(device, command)}
                                        onOpen={() => setOpenDeviceId(device.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-sm font-semibold text-mist-300">
                            Interruptores ({visibleSwitches.length})
                        </h2>
                        {shownSwitches.length === 0 ? (
                            <p className="text-sm text-mist-400">
                                Nenhum interruptor ainda. Cadastre um pelo device ID da Tuya.
                            </p>
                        ) : (
                            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                                {shownSwitches.map((device) => (
                                    <DeviceCard
                                        key={device.id}
                                        device={device}
                                        isBusy={busyDeviceIds.includes(device.id)}
                                        onCommand={(command) => sendCommand(device, command)}
                                        onOpen={() => setOpenDeviceId(device.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-mist-300">
                                Sensores ({visibleSensors.length})
                            </h2>
                            {hiddenSensors.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowHidden((current) => !current)}
                                    className="text-xs text-mist-400 hover:text-mist-300 cursor-pointer underline underline-offset-2"
                                >
                                    {showHidden
                                        ? "Esconder ocultos"
                                        : `Mostrar ocultos (${hiddenSensors.length})`}
                                </button>
                            )}
                        </div>
                        {shownSensors.length === 0 ? (
                            <p className="text-sm text-mist-400">
                                {hiddenSensors.length > 0
                                    ? "Todos os sensores estão ocultos."
                                    : "Nenhum sensor ainda. Cadastre um pelo device ID da Tuya."}
                            </p>
                        ) : (
                            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                                {shownSensors.map((sensor) => (
                                    <SensorCard
                                        key={sensor.id}
                                        sensor={sensor}
                                        onOpen={() => setOpenSensorId(sensor.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-sm font-semibold text-mist-300">
                            Modos ({presets.length})
                        </h2>
                        {presets.length === 0 ? (
                            <p className="text-sm text-mist-400">
                                Nenhum modo ainda. Cadastre um jeito de deixar a lâmpada para
                                reaplicar quando quiser.
                            </p>
                        ) : (
                            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                                {presets.map((preset) => (
                                    <PresetCard
                                        key={preset.id}
                                        preset={preset}
                                        onOpen={() => setOpenPresetId(preset.id)}
                                        onApply={() => setApplyPresetId(preset.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </>
            )}

            <Drawer
                isOpen={!!openDevice}
                onClose={() => setOpenDeviceId(null)}
                title={openDevice?.name}
            >
                {openDevice && (
                    <DeviceDrawerContent
                        device={openDevice}
                        isBusy={busyDeviceIds.includes(openDevice.id)}
                        onCommand={(command) => sendCommand(openDevice, command)}
                        onChanged={() => fetchAll(false)}
                        onDeleted={() => {
                            setOpenDeviceId(null);
                            fetchAll(false);
                        }}
                    />
                )}
            </Drawer>
            <Drawer
                isOpen={!!openSensor}
                onClose={() => setOpenSensorId(null)}
                title={openSensor?.name}
            >
                {openSensor && (
                    <SensorDrawerContent sensor={openSensor} onChanged={() => fetchAll(false)} />
                )}
            </Drawer>
            <Drawer
                isOpen={!!openPreset}
                onClose={() => setOpenPresetId(null)}
                title={openPreset?.name}
            >
                {openPreset && (
                    <PresetDrawerContent
                        preset={openPreset}
                        onChanged={() => fetchAll(false)}
                        onDeleted={() => {
                            setOpenPresetId(null);
                            fetchAll(false);
                        }}
                    />
                )}
            </Drawer>
            <ApplyPresetModal
                preset={applyPreset}
                devices={visibleLamps}
                onClose={() => setApplyPresetId(null)}
            />
        </div>
    );
}

export const tuyaDashboard: DashboardData = {
    id: "tuya",
    content: Dashboard,
    icon: HomeIcon,
    name: "Casa",
};

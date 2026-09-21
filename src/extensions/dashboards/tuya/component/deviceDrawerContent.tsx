import { useCallback, useEffect, useState } from "react";
import { BookmarkIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "core/ui/components/button";
import { useConfirm } from "core/ui/components/confirm/context";
import { Input } from "core/ui/components/input";
import { Switch } from "core/ui/components/switch";
import { useToast } from "core/ui/components/toast";
import { getTuyaEdenClient } from "extensions/scripts/tuya/client";
import { currentHex, effectiveBrightness, isColourMode } from "../lampColor";
import type { HistoryPoint, Device, DeviceCommand } from "../types";
import { DeviceHistoryChart } from "./deviceHistoryChart";
import { LampControls } from "./lampControls";
import { Modal } from "./modal";
import { SwitchControls } from "./switchControls";

interface Props {
    device: Device;
    isBusy: boolean;
    onCommand: (command: DeviceCommand) => void;
    onChanged: () => void;
    onDeleted: () => void;
}

export function DeviceDrawerContent({ device, isBusy, onCommand, onChanged, onDeleted }: Props) {
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [name, setName] = useState(device.name);
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveMode, setShowSaveMode] = useState(false);
    const [saveModeName, setSaveModeName] = useState("");
    const [isSavingMode, setIsSavingMode] = useState(false);
    const [history, setHistory] = useState<HistoryPoint[]>([]);

    useEffect(() => {
        setName(device.name);
    }, [device.id, device.name]);

    useEffect(() => {
        let cancelled = false;
        const client = getTuyaEdenClient();
        client.tuya
            .devices({ id: device.id })
            .history.get({ query: {} })
            .then(({ data }) => {
                if (cancelled || !data) return;
                setHistory((data as unknown as { snapshots: HistoryPoint[] }).snapshots ?? []);
            });
        return () => {
            cancelled = true;
        };
    }, [device.id]);

    const save = useCallback(async () => {
        setIsSaving(true);
        const client = getTuyaEdenClient();
        const { error } = await client.tuya.devices({ id: device.id }).put({ name });
        setIsSaving(false);
        if (error) {
            showToast("Falha ao salvar o dispositivo", "error");
            return;
        }
        showToast("Dispositivo salvo", "success");
        onChanged();
    }, [device.id, name, showToast, onChanged]);

    const remove = useCallback(async () => {
        const ok = await confirm({
            title: "Remover dispositivo",
            message: `Remover "${device.name}"? O histórico dele também será apagado.`,
        });
        if (!ok) return;
        const client = getTuyaEdenClient();
        const { error } = await client.tuya.devices({ id: device.id }).delete();
        if (error) {
            showToast("Falha ao remover o dispositivo", "error");
            return;
        }
        showToast("Dispositivo removido", "success");
        onDeleted();
    }, [confirm, device.id, device.name, showToast, onDeleted]);

    const saveAsMode = useCallback(async () => {
        if (!saveModeName) return;
        setIsSavingMode(true);
        const { state } = device;
        const { error } = await getTuyaEdenClient().tuya.presets.post({
            name: saveModeName,
            power: state.power ?? true,
            brightness: state.brightness,
            colorTemp: state.colorTemp,
            colorHex: state.colorHex,
            workMode: state.workMode === "colour" ? "colour" : "white",
        });
        setIsSavingMode(false);
        if (error) {
            showToast("Falha ao salvar o modo", "error");
            return;
        }
        showToast(`Modo "${saveModeName}" salvo`, "success");
        setShowSaveMode(false);
        setSaveModeName("");
        onChanged();
    }, [device, saveModeName, showToast, onChanged]);

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3">
                {device.kind === "switch" ? (
                    <SwitchControls device={device} isBusy={isBusy} onCommand={onCommand} />
                ) : (
                    <LampControls device={device} isBusy={isBusy} onCommand={onCommand} />
                )}
            </section>

            {device.kind === "lamp" && device.state.online && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-mist-300">Modo</h3>
                    <div className="flex items-center gap-2 text-sm text-mist-400">
                        <span
                            className="size-4 rounded-full border border-gray-600 shrink-0"
                            style={{ backgroundColor: currentHex(device.state) }}
                        />
                        <span>
                            {isColourMode(device.state)
                                ? currentHex(device.state)
                                : "Branco"}
                            {(() => {
                                const b = effectiveBrightness(device.state);
                                if (b === null) return "";
                                return ` · ${b}%`;
                            })()}
                        </span>
                    </div>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setSaveModeName(`${device.name} - ${new Date().toLocaleString("pt-BR")}`);
                            setShowSaveMode(true);
                        }}
                    >
                        <BookmarkIcon className="size-4" /> Salvar como modo
                    </Button>
                </section>
            )}

            <Modal
                isOpen={showSaveMode}
                onClose={() => setShowSaveMode(false)}
                title={`Salvar estado de "${device.name}" como modo`}
            >
                <Input
                    label="Nome do modo"
                    value={saveModeName}
                    onChange={(e) => setSaveModeName(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setShowSaveMode(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={saveAsMode} isLoading={isSavingMode} disabled={!saveModeName}>
                        Salvar
                    </Button>
                </div>
            </Modal>

            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-mist-300">Configuração</h3>
                <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
                <Switch
                    checked={device.hidden}
                    onChange={async (hidden) => {
                        const { error } = await getTuyaEdenClient()
                            .tuya.devices({ id: device.id })
                            .put({ hidden });
                        if (error) {
                            showToast("Falha ao alterar a visibilidade", "error");
                            return;
                        }
                        onChanged();
                    }}
                    label={device.hidden ? "Oculta no painel" : "Visível no painel"}
                />
                <p className="text-xs text-mist-400">
                    Ocultar tira o dispositivo do painel sem parar o controle nem o histórico.
                </p>
                <dl className="text-xs text-mist-400 flex flex-wrap gap-x-4 gap-y-1">
                    <div>
                        <dt className="inline">Device ID: </dt>
                        <dd className="inline font-mono">{device.tuyaDeviceId}</dd>
                    </div>
                    <div>
                        <dt className="inline">Tipo: </dt>
                        <dd className="inline">
                            {device.kind === "lamp" ? "Lâmpada" : "Interruptor"}
                        </dd>
                    </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={save} isLoading={isSaving}>
                        Salvar
                    </Button>
                    <Button variant="secondary" onClick={remove}>
                        <TrashIcon className="size-4" /> Remover
                    </Button>
                </div>
            </section>

            {history.length > 0 && <DeviceHistoryChart data={history} />}
        </div>
    );
}

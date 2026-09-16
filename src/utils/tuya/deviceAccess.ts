import { DONT_TRACE_ID } from "core/instrumentation";
import type { DeviceState } from "utils/tuya/capabilities";
import {
    getDeviceDetail,
    getDeviceStatus,
    getDevicesStatus,
    sendDeviceCommands,
} from "utils/tuya/cloud/client";
import {
    cloudStatusToDeviceState,
    cloudStatusToSwitchState,
    deviceCommandToCloudCommands,
    switchChannelsToCloudCommands,
} from "utils/tuya/cloud/deviceState";
import type { DeviceCommand } from "utils/tuya/commandTypes";
import type { Device } from "utils/tuya/devices";

export async function readDeviceState(device: Device, traceId: string): Promise<DeviceState> {
    const [status, detail] = await Promise.all([
        getDeviceStatus(device.tuyaDeviceId, traceId),
        getDeviceDetail(device.tuyaDeviceId, traceId),
    ]);
    return stateFromCloud(device, status, detail.online);
}

/**
 * Reads a whole set of devices from the cloud in one call, however many there are.
 */
export async function readStatesFromCloud(
    devices: Device[],
    traceId: string,
): Promise<Map<string, DeviceState>> {
    if (devices.length === 0) return new Map();

    const statuses = await getDevicesStatus(
        devices.map((device) => device.tuyaDeviceId),
        traceId,
    );

    const states = new Map<string, DeviceState>();
    for (const device of devices) {
        const status = statuses.get(device.tuyaDeviceId) ?? [];
        states.set(device.id, stateFromCloud(device, status, status.length > 0));
    }
    return states;
}

function stateFromCloud(
    device: Device,
    status: Awaited<ReturnType<typeof getDeviceStatus>>,
    online: boolean,
): DeviceState {
    return device.kind === "switch"
        ? cloudStatusToSwitchState(status, online)
        : cloudStatusToDeviceState(status, online);
}

export async function commandDevice(
    device: Device,
    command: DeviceCommand,
    traceId: string,
): Promise<DeviceState> {
    const status = await getDeviceStatus(device.tuyaDeviceId, traceId);
    const commands =
        device.kind === "switch"
            ? switchChannelsToCloudCommands(channelsFor(command))
            : deviceCommandToCloudCommands(command, status);
    if (commands.length === 0) {
        throw new Error("No supported command was given for this device");
    }

    await sendDeviceCommands(device.tuyaDeviceId, commands, traceId);

    // Tuya's status shadow trails the command by a second or two, so reading it back here
    // would return the value from before the change and make the UI snap backwards. The
    // cloud accepted the command, so the commanded values are the truthful answer; Pulsar
    // reconciles against the device's own report either way.
    const previous =
        device.kind === "switch"
            ? cloudStatusToSwitchState(status, true)
            : cloudStatusToDeviceState(status, true);
    return applyCommandToState(previous, command);
}

/** A single-gang switch is driven by a plain on/off, which means channel 1. */
function channelsFor(command: DeviceCommand): Record<string, boolean> {
    if (command.channels && Object.keys(command.channels).length > 0) return command.channels;
    if (command.power !== undefined) return { "1": command.power };
    return {};
}

function applyCommandToState(state: DeviceState, command: DeviceCommand): DeviceState {
    if (state.channels) {
        return { ...state, channels: { ...state.channels, ...channelsFor(command) } };
    }
    return {
        ...state,
        power: command.power ?? state.power,
        brightness: command.brightness ?? state.brightness,
        colorTemp: command.colorTemp ?? state.colorTemp,
        colorHex: command.colorHex ?? state.colorHex,
        workMode:
            command.workMode ??
            (command.colorHex !== undefined
                ? "colour"
                : command.colorTemp !== undefined
                  ? "white"
                  : state.workMode),
    };
}

/** For callers with no trace of their own, such as the dashboard's polling routes. */
export const UNTRACED = DONT_TRACE_ID;

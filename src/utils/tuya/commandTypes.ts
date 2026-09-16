import type { WorkMode } from "utils/tuya/capabilities";

export interface DeviceCommand {
    power?: boolean;
    /** 0-100 */
    brightness?: number;
    /** 0-100 */
    colorTemp?: number;
    /** `#rrggbb` */
    colorHex?: string;
    workMode?: WorkMode;
    /** Switches only: relay states keyed by channel number. */
    channels?: Record<string, boolean>;
}

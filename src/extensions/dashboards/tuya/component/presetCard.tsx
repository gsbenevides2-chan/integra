import { LightBulbIcon, PlayIcon } from "@heroicons/react/24/outline";
import { Button } from "core/ui/components/button";
import { hsvFromHex, hueHex, whiteHex } from "../lampColor";
import type { Preset } from "../types";

interface Props {
    preset: Preset;
    onOpen: () => void;
    onApply: () => void;
    firstOnlineDeviceName?: string;
    onQuickApply?: () => void;
}

export function PresetCard({ preset, onOpen, onApply, firstOnlineDeviceName, onQuickApply }: Props) {
    const isColour = preset.workMode === "colour" && preset.colorHex !== null;
    const hsv = isColour ? hsvFromHex(preset.colorHex) : null;
    const tint = hsv ? hueHex(hsv) : whiteHex(preset.colorTemp);
    const brightness = hsv ? Math.round(hsv.v * 100) : preset.brightness;

    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-3">
            <button
                type="button"
                onClick={onOpen}
                className="flex items-center gap-2 text-left cursor-pointer min-w-0"
            >
                <LightBulbIcon className="size-5 shrink-0" style={{ color: tint }} />
                <span className="truncate">{preset.name}</span>
            </button>

            <div className="flex items-center gap-2">
                <span
                    className="size-4 rounded-full border border-gray-600 shrink-0"
                    style={{ backgroundColor: tint }}
                />
                <span className="text-xs text-mist-400">
                    {isColour ? tint : "Branco"}
                    {brightness !== null && ` · ${brightness}%`}
                </span>
            </div>

            <div className="flex items-center gap-2">
                {onQuickApply && firstOnlineDeviceName && (
                    <Button
                        variant="secondary"
                        onClick={onQuickApply}
                        className="flex-1 min-w-0"
                    >
                        <PlayIcon className="size-4 shrink-0" /> Aplicar
                        na {firstOnlineDeviceName}
                    </Button>
                )}
                <Button variant="secondary" onClick={onApply}>
                    <PlayIcon className="size-4" />{" "}
                    {onQuickApply ? "Aplicar em outra" : "Aplicar"}
                </Button>
            </div>
        </div>
    );
}

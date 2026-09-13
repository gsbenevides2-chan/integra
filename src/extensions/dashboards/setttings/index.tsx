import { CogIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";

function Dashboard() {
    return (
        <div className="p-3 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-xl">Configuráveis</h1>
            </div>
            <section className="flex flex-col gap-2"></section>
        </div>
    );
}

export const settingsDashbord: DashboardData = {
    id: "settings",
    content: Dashboard,
    icon: CogIcon,
    name: "Configuráveis",
};

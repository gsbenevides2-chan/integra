import type { adminRoutes } from "@server/modules/admin";

import { treaty } from "@elysia/eden";

export function getAdminEdenClient() {
  return treaty<typeof adminRoutes>("", {
    keepDomain: true,
  });
}
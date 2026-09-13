import { instrumentableFetch } from "core/instrumentation";
import type { StatusFetcher } from "./types";

interface ShopifyStatusResponse {
    status: {
        indicator: "none" | "minor" | "major" | "critical";
        description: string;
    };
    incidents?: Array<{
        name: string;
        status: string;
    }>;
}

/**
 * Fetches the status of Shopify services from the Shopify Status API.
 * https://www.shopifystatus.com/
 */
export const fetchFromShopifyStatus: StatusFetcher = async (endpoint, traceId) => {
    try {
        const response = await instrumentableFetch(
            traceId,
            "https://www.shopifystatus.com/api/v2/status.json",
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                },
            },
        );

        if (!response.ok) {
            return {
                status: "DOWN",
                problemDescription: `Shopify API returned ${response.status}`,
            };
        }

        const data = (await response.json()) as ShopifyStatusResponse;

        // Status indicators: "none" = OK, anything else = DOWN
        if (data.status.indicator === "none") {
            return { status: "OK" };
        }

        const problemDescription = data.status.description || `Status: ${data.status.indicator}`;
        return { status: "DOWN", problemDescription };
    } catch (error) {
        const problemDescription =
            error instanceof Error && error.name === "TimeoutError"
                ? "Request timed out"
                : error instanceof Error
                  ? error.message
                  : "Unknown error occurred";

        return { status: "DOWN", problemDescription };
    }
};

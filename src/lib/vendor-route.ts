import type { NextRequest } from "next/server";

export type RouteContext<
  T extends Record<string, string | string[] | undefined> = Record<string, never>,
> = {
  params: Promise<T>;
};

type VendorMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
type VendorModule = Partial<Record<VendorMethod, unknown>>;
type VendorLoader = () => Promise<VendorModule>;

export function createVendorRouteHandler<
  T extends Record<string, string | string[] | undefined> = Record<string, never>,
>(loader: VendorLoader, method: VendorMethod) {
  return async function handler(
    request: NextRequest,
    context: RouteContext<T>,
  ): Promise<Response> {
    const routeModule = await loader();
    const routeHandler = routeModule[method];

    if (typeof routeHandler !== "function") {
      throw new Error(`Vendor route is missing the ${method} handler`);
    }

    return routeHandler(request as never, context as never) as Promise<Response>;
  };
}
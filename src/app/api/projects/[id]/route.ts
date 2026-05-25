import { createVendorRouteHandler } from "@/lib/vendor-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loadRouteModule = () =>
  import("../../../../../vendor/react-video-editor-pro/app/api/projects/[id]/route");

export const DELETE = createVendorRouteHandler<{ id: string }>(loadRouteModule, "DELETE");
export const PATCH = createVendorRouteHandler<{ id: string }>(loadRouteModule, "PATCH");
export const PUT = createVendorRouteHandler<{ id: string }>(loadRouteModule, "PUT");
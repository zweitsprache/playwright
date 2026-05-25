import { createVendorRouteHandler } from "@/lib/vendor-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loadRouteModule = () =>
  import("../../../../../vendor/react-video-editor-pro/app/api/render-jobs/[id]/route");

export const GET = createVendorRouteHandler<{ id: string }>(loadRouteModule, "GET");
export const POST = createVendorRouteHandler<{ id: string }>(loadRouteModule, "POST");
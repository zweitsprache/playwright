import { createVendorRouteHandler } from "@/lib/vendor-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loadRouteModule = () =>
  import("../../../../vendor/react-video-editor-pro/app/api/projects/route");

export const GET = createVendorRouteHandler(loadRouteModule, "GET");
export const POST = createVendorRouteHandler(loadRouteModule, "POST");
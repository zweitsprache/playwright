import { createVendorRouteHandler } from "@/lib/vendor-route";

const loadRouteModule = () =>
  import("../../../../../../../vendor/react-video-editor-pro/app/api/latest/ssr/download/[id]/route");

export const GET = createVendorRouteHandler<{ id: string }>(loadRouteModule, "GET");
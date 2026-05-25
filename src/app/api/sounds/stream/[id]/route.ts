import { createVendorRouteHandler } from "@/lib/vendor-route";

const loadRouteModule = () =>
  import("../../../../../../vendor/react-video-editor-pro/app/api/sounds/stream/[id]/route");

export const GET = createVendorRouteHandler<{ id: string }>(loadRouteModule, "GET");
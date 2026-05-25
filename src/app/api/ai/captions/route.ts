import { createVendorRouteHandler } from "@/lib/vendor-route";

const loadRouteModule = () =>
  import("../../../../../vendor/react-video-editor-pro/app/api/ai/captions/route");

export const POST = createVendorRouteHandler(loadRouteModule, "POST");
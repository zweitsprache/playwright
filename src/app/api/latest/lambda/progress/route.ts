import { createVendorRouteHandler } from "@/lib/vendor-route";

const loadRouteModule = () =>
  import("../../../../../../vendor/react-video-editor-pro/app/api/latest/lambda/progress/route");

export const POST = createVendorRouteHandler(loadRouteModule, "POST");
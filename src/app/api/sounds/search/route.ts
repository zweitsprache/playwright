import { createVendorRouteHandler } from "@/lib/vendor-route";

const loadRouteModule = () =>
  import("../../../../../vendor/react-video-editor-pro/app/api/sounds/search/route");

export const GET = createVendorRouteHandler(loadRouteModule, "GET");
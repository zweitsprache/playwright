import { createVendorRouteHandler } from "@/lib/vendor-route";

const loadRouteModule = () =>
  import("../../../../../vendor/react-video-editor-pro/app/api/fonts/[name]/route");

export const GET = createVendorRouteHandler<{ name: string }>(loadRouteModule, "GET");
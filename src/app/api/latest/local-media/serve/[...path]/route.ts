import { createVendorRouteHandler } from "@/lib/vendor-route";

const loadRouteModule = () =>
  import(
    "../../../../../../../vendor/react-video-editor-pro/app/api/latest/local-media/serve/[...path]/route"
  );

export const GET = createVendorRouteHandler<{ path: string[] }>(loadRouteModule, "GET");
import type { Metadata } from "next";

import LogoEditor from "./logo-editor";

export const metadata: Metadata = {
  title: "Logo Slide Studio",
  description: "Edit slide copy and export each design as a PNG.",
};

export default function LogoEditorPage() {
  return <LogoEditor />;
}

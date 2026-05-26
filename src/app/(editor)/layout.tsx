import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";

import styles from "./layout.module.css";

import "../../../vendor/react-video-editor-pro/app/globals.css";

import { PostHogProvider } from "../../../vendor/react-video-editor-pro/app/reactvideoeditor/pro/components/providers/posthog-provider";
import { Toaster } from "../../../vendor/react-video-editor-pro/app/reactvideoeditor/pro/components/ui/toaster";

export const metadata: Metadata = {
  title: "React Video Editor | Pro",
  description: "Purchased version of the React Video Editor.",
};

export default function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PostHogProvider>
          <main>
            <LogoutButton className={styles.logoutButton} />
            {children}
            <Toaster />
          </main>
        </PostHogProvider>
      </body>
    </html>
  );
}
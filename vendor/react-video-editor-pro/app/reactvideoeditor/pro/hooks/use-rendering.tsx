import { z } from "zod";
import { useCallback, useMemo, useState } from "react";
import { CompositionProps } from "../types";
import { useRenderer } from "../contexts/renderer-context";
import { getUserId } from "../utils/general/user-id";

const guessFileExtension = (blob: Blob, fallbackName: string) => {
  const fallbackExtension = fallbackName.split(".").pop();
  if (fallbackExtension && fallbackExtension !== fallbackName) {
    return fallbackExtension;
  }

  const mimeType = blob.type.toLowerCase();
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("webp")) return "webp";

  return "bin";
};

const uploadBlobUrlForRender = async (
  blobUrl: string,
  userId: string,
  fallbackName: string,
) => {
  const blobResponse = await fetch(blobUrl);
  if (!blobResponse.ok) {
    throw new Error(`Failed to read local media blob: ${blobResponse.statusText}`);
  }

  const blob = await blobResponse.blob();
  const extension = guessFileExtension(blob, fallbackName);
  const file = new File([blob], `${fallbackName}.${extension}`, {
    type: blob.type || undefined,
  });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", userId);

  const uploadResponse = await fetch("/api/latest/local-media/upload", {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorData = await uploadResponse.json().catch(() => null);
    throw new Error(
      errorData?.error || "Failed to upload local media for rendering",
    );
  }

  const uploadResult = await uploadResponse.json();
  return uploadResult.serverPath as string;
};

const ensureRenderableInputProps = async (
  inputProps: z.infer<typeof CompositionProps>,
) => {
  const userId = getUserId();
  const uploadedBlobUrls = new Map<string, string>();

  const ensureRenderableUrl = async (url: string, fallbackName: string) => {
    if (!url.startsWith("blob:")) {
      return url;
    }

    const cachedUrl = uploadedBlobUrls.get(url);
    if (cachedUrl) {
      return cachedUrl;
    }

    const uploadedUrl = await uploadBlobUrlForRender(url, userId, fallbackName);
    uploadedBlobUrls.set(url, uploadedUrl);
    return uploadedUrl;
  };

  const overlays = await Promise.all(
    (inputProps.overlays || []).map(async (overlay: any, index: number) => {
      if (!overlay || typeof overlay !== "object") {
        return overlay;
      }

      const fallbackBaseName = `${overlay.type || "overlay"}-${overlay.id ?? index}`;
      const updatedOverlay = { ...overlay };

      if (typeof updatedOverlay.src === "string") {
        updatedOverlay.src = await ensureRenderableUrl(
          updatedOverlay.src,
          `${fallbackBaseName}-src`,
        );
      }

      if (typeof updatedOverlay.audioSrc === "string") {
        updatedOverlay.audioSrc = await ensureRenderableUrl(
          updatedOverlay.audioSrc,
          `${fallbackBaseName}-audio`,
        );
      }

      if (
        updatedOverlay.type === "image" &&
        typeof updatedOverlay.content === "string"
      ) {
        updatedOverlay.content = await ensureRenderableUrl(
          updatedOverlay.content,
          `${fallbackBaseName}-content`,
        );
      }

      return updatedOverlay;
    }),
  );

  return {
    ...inputProps,
    overlays,
  };
};

// Define possible states for the rendering process
export type State =
  | { status: "init" } // Initial state
  | { status: "invoking" } // API call is being made
  | {
      // Video is being rendered
      renderId: string;
      progress: number;
      status: "rendering";
      bucketName?: string; // Make bucketName optional
    }
  | {
      // Error occurred during rendering
      renderId: string | null;
      status: "error";
      error: Error;
    }
  | {
      // Rendering completed successfully
      url: string;
      size: number;
      status: "done";
    };

// Utility function to create a delay
const wait = async (milliSeconds: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, milliSeconds);
  });
};

/**
 * Custom hook to manage video rendering process using pluggable renderer
 * 
 * @param id - Unique identifier for the composition
 * @param inputProps - Composition properties for rendering
 * @returns Object containing render controls and state
 * 
 * @example
 * ```tsx
 * const { renderMedia, state, undo } = useRendering("my-composition", {
 *   overlays: [],
 *   durationInFrames: 900,
 *   width: 1920,
 *   height: 1080,
 *   fps: 30,
 *   src: "video.mp4"
 * });
 * 
 * // Start rendering
 * await renderMedia();
 * 
 * // Check state
 * if (state.status === "done") {
 *   console.log("Video ready:", state.url);
 * }
 * ```
 */
export const useRendering = (
  id: string,
  inputProps: z.infer<typeof CompositionProps>
) => {
  const rendererConfig = useRenderer();
  
  // Maintain current state of the rendering process
  const [state, setState] = useState<State>({
    status: "init",
  });

  // Main function to handle the rendering process
  const renderMedia = useCallback(async () => {
    // Prevent multiple concurrent renders
    if (state.status === "invoking" || state.status === "rendering") {
      console.log(`Render already in progress, ignoring new render request. Current status: ${state.status}`);
      return;
    }
    
    console.log(`Starting renderMedia process`);
    setState({
      status: "invoking",
    });
    
    try {
      const { renderer, pollingInterval = 1000, initialDelay = 0 } = rendererConfig;

      const renderableInputProps = await ensureRenderableInputProps(inputProps);

      console.log("Calling renderVideo with inputProps", renderableInputProps);
      const response = await renderer.renderVideo({ id, inputProps: renderableInputProps });
      const renderId = response.renderId;
      const bucketName = response.bucketName;

      // Apply initial delay if configured
      if (initialDelay > 0) {
        await wait(initialDelay);
      }

      setState({
        status: "rendering",
        progress: 0,
        renderId,
        ...(bucketName && { bucketName }),
      });

      // Wait a short moment before first progress check to allow async render process to initialize
      await wait(100);

      let pending = true;

      while (pending) {
        console.log(`Checking progress for renderId=${renderId}`);
        const result = await renderer.getProgress({
          id: renderId,
          ...(bucketName && { bucketName }),
        });
        
        console.log("Progress result", result);
        
        switch (result.type) {
          case "error": {
            console.error(`Render error: ${result.message}`);
            setState({
              status: "error",
              renderId: renderId,
              error: new Error(result.message),
            });
            pending = false;
            break;
          }
          case "done": {
            console.log(
              `Render complete: url=${result.url}, size=${result.size}`
            );
            setState({
              size: result.size,
              url: result.url,
              status: "done",
            });
            pending = false;
            break;
          }
          case "progress": {
            console.log(`Render progress: ${result.progress}%`);
            setState({
              status: "rendering",
              progress: result.progress,
              renderId: renderId,
              ...(bucketName && { bucketName }),
            });
            await wait(pollingInterval);
            break;
          }
        }
      }
    } catch (err) {
      console.error("Unexpected error during rendering:", err);
      setState({
        status: "error",
        error: err as Error,
        renderId: null,
      });
    }
  }, [id, inputProps, rendererConfig, state.status]);

  // Reset the rendering state back to initial
  const undo = useCallback(() => {
    setState({ status: "init" });
  }, []);

  // Return memoized values to prevent unnecessary re-renders
  return useMemo(
    () => ({
      renderMedia, // Function to start rendering
      state, // Current state of the render
      undo, // Function to reset the state
    }),
    [renderMedia, state, undo]
  );
};

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { LocalMediaFile } from "../types";
import { getUserId } from "../utils/general/user-id";
import {
  getUserMediaItems,
  deleteMediaItem as deleteFromIndexDB,
  clearUserMedia,
  updateMediaItem,
} from "../utils/general/indexdb";
import {
  uploadMediaFile,
  deleteMediaFile,
  ensureMediaItemServerPath,
} from "../utils/general/media-upload";

interface LocalMediaContextType {
  localMediaFiles: LocalMediaFile[];
  addMediaFile: (file: File) => Promise<LocalMediaFile | void>;
  removeMediaFile: (id: string) => Promise<void>;
  clearMediaFiles: () => Promise<void>;
  isLoading: boolean;
}

const LocalMediaContext = createContext<LocalMediaContextType | undefined>(
  undefined
);

/**
 * LocalMediaProvider Component
 *
 * Provides context for managing local media files uploaded by the user.
 * Handles:
 * - Storing and retrieving local media files from IndexedDB and server
 * - Adding new media files
 * - Removing media files
 * - Persisting media files between sessions
 */
export const LocalMediaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [localMediaFiles, setLocalMediaFiles] = useState<LocalMediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId] = useState(() => getUserId());

  // Load saved media files from IndexedDB on component mount
  useEffect(() => {
    const loadMediaFiles = async () => {
      try {
        setIsLoading(true);
        const mediaItems = await getUserMediaItems(userId);

        // Prefer a stable server path for blob-backed items whenever the local server is available.
        const hydratedMediaItems = await Promise.all(
          mediaItems.map(async (item) => {
            try {
              const promoted = await ensureMediaItemServerPath(item);
              if (promoted.serverPath !== item.serverPath) {
                await updateMediaItem(promoted);
              }
              return promoted;
            } catch (error) {
              console.warn("Could not promote local media item to server path:", error);
              return item;
            }
          }),
        );

        const files: LocalMediaFile[] = hydratedMediaItems.map((item) => {
          let itemPath = item.serverPath;

          if (itemPath.startsWith("blob:") && item.fileBlob) {
            itemPath = URL.createObjectURL(item.fileBlob);
          }

          return {
            id: item.id,
            name: item.name,
            type: item.type,
            path: itemPath,
            size: item.size,
            lastModified: item.lastModified,
            thumbnail: item.thumbnail || "",
            duration: item.duration || 0,
          };
        });

        setLocalMediaFiles(files);
      } catch (error) {
        console.error("Error loading media files from IndexedDB:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMediaFiles();
  }, [userId]);

  /**
   * Add a new media file to the collection
   */
  const addMediaFile = useCallback(
    async (file: File): Promise<LocalMediaFile | void> => {
      setIsLoading(true);
      try {
        // Upload file with hybrid approach (server upload with blob fallback)
        const mediaItem = await uploadMediaFile(file);
        let stableMediaItem = mediaItem;

        try {
          stableMediaItem = await ensureMediaItemServerPath(mediaItem);
          if (stableMediaItem.serverPath !== mediaItem.serverPath) {
            await updateMediaItem(stableMediaItem);
          }
        } catch (error) {
          console.warn("Could not promote uploaded media item to server path:", error);
        }

        // Convert to LocalMediaFile format
        const newMediaFile: LocalMediaFile = {
          id: stableMediaItem.id,
          name: stableMediaItem.name,
          type: stableMediaItem.type,
          path: stableMediaItem.serverPath,
          size: stableMediaItem.size,
          lastModified: stableMediaItem.lastModified,
          thumbnail: stableMediaItem.thumbnail || "",
          duration: stableMediaItem.duration || 0,
        };

        // Update state with the new media file
        setLocalMediaFiles((prev) => {
          // Check if file with same ID already exists
          const exists = prev.some((item) => item.id === newMediaFile.id);
          if (exists) {
            // Replace existing file
            return prev.map((item) =>
              item.id === newMediaFile.id ? newMediaFile : item
            );
          }
          // Add new file
          return [...prev, newMediaFile];
        });

        return newMediaFile;
      } catch (error) {
        console.error("Error adding media file:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Remove a media file by ID
   */
  const removeMediaFile = useCallback(
    async (id: string): Promise<void> => {
      try {
        const fileToRemove = localMediaFiles.find((file) => file.id === id);

        if (fileToRemove) {
          // Delete from server
          await deleteMediaFile(userId, fileToRemove.path);

          // Delete from IndexedDB
          await deleteFromIndexDB(id);

          // Update state
          setLocalMediaFiles((prev) => prev.filter((file) => file.id !== id));
        }
      } catch (error) {
        console.error("Error removing media file:", error);
      }
    },
    [localMediaFiles, userId]
  );

  /**
   * Clear all media files
   */
  const clearMediaFiles = useCallback(async (): Promise<void> => {
    try {
      // Delete all files from server
      for (const file of localMediaFiles) {
        await deleteMediaFile(userId, file.path);
      }

      // Clear IndexedDB
      await clearUserMedia(userId);

      // Update state
      setLocalMediaFiles([]);
    } catch (error) {
      console.error("Error clearing media files:", error);
    }
  }, [localMediaFiles, userId]);

  const value = {
    localMediaFiles,
    addMediaFile,
    removeMediaFile,
    clearMediaFiles,
    isLoading,
  };

  return (
    <LocalMediaContext.Provider value={value}>
      {children}
    </LocalMediaContext.Provider>
  );
};

/**
 * Hook to use the local media context
 */
export const useLocalMedia = () => {
  const context = useContext(LocalMediaContext);
  if (context === undefined) {
    throw new Error("useLocalMedia must be used within a LocalMediaProvider");
  }
  return context;
};

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handles media file uploads (Works in development, fails gracefully in production)
 * 
 * This API endpoint:
 * 1. Receives a file and user ID
 * 2. Creates a user directory if it doesn't exist
 * 3. Saves the file to the user's directory
 * 4. Returns the file path and ID
 * 
 * Note: This will fail in Vercel production due to read-only filesystem,
 * which triggers the client-side fallback to blob storage.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;
    
    if (!file || !userId) {
      return NextResponse.json(
        { error: 'File and userId are required' },
        { status: 400 }
      );
    }
    
    const fileId = uuidv4();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${fileId}.${fileExtension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`users/${userId}/${fileName}`, buffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType: file.type || undefined,
      });

      return NextResponse.json({
        success: true,
        id: fileId,
        fileName: file.name,
        serverPath: blob.url,
        size: file.size,
        type: file.type,
      });
    }

    // Local filesystem fallback for development without Blob configured.
    const userDir = path.join(process.cwd(), 'public', 'users', userId);
    if (!existsSync(userDir)) {
      await mkdir(userDir, { recursive: true });
    }

    const filePath = path.join(userDir, fileName);
    await writeFile(filePath, buffer);
    const publicPath = `/users/${userId}/${fileName}`;
    
    return NextResponse.json({
      success: true,
      id: fileId,
      fileName: file.name,
      serverPath: publicPath,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

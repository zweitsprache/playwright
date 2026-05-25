import {
  ProgressParams,
  ProgressResponse,
  RenderParams,
  RenderResponse,
  RenderTypeInfo,
  VideoRenderer,
} from "../types/renderer";
import { getUserId } from "./general/user-id";

type RenderJobResponse = {
  id: string;
  provider: string;
  status: string;
  progress: number;
  renderId: string | null;
  bucketName: string | null;
  outputUrl: string | null;
  outputSize: number | null;
  errorMessage: string | null;
};

export class RenderJobRenderer implements VideoRenderer {
  private endpoint: string;
  private renderTypeInfo: RenderTypeInfo;

  constructor(endpoint: string, renderType: RenderTypeInfo) {
    this.endpoint = endpoint;
    this.renderTypeInfo = renderType;
  }

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      "x-user-id": getUserId(),
    };
  }

  async renderVideo(params: RenderParams): Promise<RenderResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        projectId: params.id,
        compositionId: params.id,
        provider: this.renderTypeInfo.type,
        inputProps: params.inputProps,
      }),
    });

    if (!response.ok) {
      throw new Error(`Render job request failed: ${response.statusText}`);
    }

    const responseData = (await response.json()) as RenderJobResponse;
    return {
      renderId: responseData.id,
    };
  }

  async getProgress(params: ProgressParams): Promise<ProgressResponse> {
    const response = await fetch(`${this.endpoint}/${params.id}`, {
      method: "POST",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Render job progress request failed: ${response.statusText}`);
    }

    const job = (await response.json()) as RenderJobResponse;

    if (job.status === "error") {
      return {
        type: "error",
        message: job.errorMessage || "Render failed",
      };
    }

    if (job.status === "done" && job.outputUrl && job.outputSize) {
      return {
        type: "done",
        url: job.outputUrl,
        size: job.outputSize,
      };
    }

    return {
      type: "progress",
      progress: Math.max(0.03, job.progress || 0),
    };
  }

  get renderType(): RenderTypeInfo {
    return this.renderTypeInfo;
  }
}
let counter = 0;
const MODEL_LOAD_TIMEOUT_MS = 180_000;

export type ClipModelStatus = "loading" | "ready" | "error";

export interface ClipStatusUpdate {
  status: ClipModelStatus;
  progress: number;
  error?: string;
}

type PendingRequest = {
  resolve: (value: number[] | void) => void;
  reject: (reason?: unknown) => void;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Không đọc được ảnh."));
    reader.readAsDataURL(blob);
  });

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

export class ClipService {
  private worker: Worker;
  private pending = new Map<number, PendingRequest>();
  private loadPromise: Promise<void> | null = null;

  constructor(private onStatus?: (update: ClipStatusUpdate) => void) {
    this.worker = new Worker(new URL("../clip.worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.addEventListener("message", this.handleMessage);
  }

  loadModel(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    const requestId = ++counter;
    this.onStatus?.({ status: "loading", progress: 0 });

    this.loadPromise = withTimeout(
      new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ type: "LOAD_MODEL", requestId });
      }),
      MODEL_LOAD_TIMEOUT_MS,
      "Tải model CLIP quá lâu. Kiểm tra mạng hoặc thử refresh lại trang.",
    );

    return this.loadPromise;
  }

  async extractVector(image: Blob): Promise<number[]> {
    await this.loadModel();

    const requestId = ++counter;
    const imageDataUrl = await blobToDataUrl(image);

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: "EXTRACT_VECTOR",
        requestId,
        image: imageDataUrl,
      });
    });
  }

  terminate() {
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.terminate();
    this.pending.clear();
  }

  private handleMessage = (event: MessageEvent) => {
    const data = event.data;

    if (data.type === "MODEL_PROGRESS") {
      this.onStatus?.({
        status: "loading",
        progress: Math.round(data.progress ?? 0),
      });
      return;
    }

    if (data.type === "MODEL_READY") {
      this.onStatus?.({ status: "ready", progress: 100 });
      this.resolvePending(data.requestId);
      return;
    }

    if (data.type === "VECTOR_READY") {
      this.resolvePending(data.requestId, data.vector);
      return;
    }

    if (data.type === "ERROR") {
      this.onStatus?.({
        status: "error",
        progress: 0,
        error: data.error,
      });
      this.rejectPending(data.requestId, data.error);
    }
  };

  private resolvePending(requestId?: number, value?: number[]) {
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.resolve(value);
  }

  private rejectPending(requestId?: number, error?: string) {
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.reject(new Error(error ?? "CLIP worker failed."));
  }
}

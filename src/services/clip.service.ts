let counter = 0;

export class ClipService {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL("../workers/clip.worker.ts", import.meta.url),
      { type: "module" }
    );
  }

  async extractVector(image: Blob): Promise<number[]> {
    const requestId = ++counter;

    return new Promise((resolve, reject) => {
      const listener = (event: MessageEvent) => {
        const data = event.data;

        if (data.requestId !== requestId) return;

        if (data.type === "VECTOR_READY") {
          this.worker.removeEventListener(
            "message",
            listener
          );

          resolve(data.vector);
        }

        if (data.type === "ERROR") {
          this.worker.removeEventListener(
            "message",
            listener
          );

          reject(data.error);
        }
      };

      this.worker.addEventListener(
        "message",
        listener
      );

      this.worker.postMessage({
        type: "EXTRACT_VECTOR",
        requestId,
        image,
      });
    });
  }
}

import { pipeline } from "@xenova/transformers";

let extractorPromise: Promise<any> | null = null;

const loadExtractor = (requestId?: number) => {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "image-feature-extraction",
      "Xenova/clip-vit-base-patch32",
      {
        progress_callback(progress: any) {
          self.postMessage({
            type: "MODEL_PROGRESS",
            requestId,
            progress: progress.progress ?? 0,
          });
        },
      },
    );
  }

  return extractorPromise;
};

self.addEventListener("message", async (event) => {
  const { type, requestId, image } = event.data;

  try {
    if (type === "LOAD_MODEL") {
      await loadExtractor(requestId);
      self.postMessage({ type: "MODEL_READY", requestId });
      return;
    }

    if (type === "EXTRACT_VECTOR") {
      const extractor = await loadExtractor();
      const output = await extractor(image, {
        pooling: "mean",
        normalize: true,
      });
      const vector = Array.from(output.data as Float32Array);

      if (vector.length !== 512) {
        throw new Error(`CLIP trả về vector ${vector.length} chiều, cần đúng 512 chiều.`);
      }

      self.postMessage({
        type: "VECTOR_READY",
        requestId,
        vector,
      });
    }
  } catch (error) {
    self.postMessage({
      type: "ERROR",
      requestId,
      error: error instanceof Error ? error.message : "Unknown Error",
    });
  }
});

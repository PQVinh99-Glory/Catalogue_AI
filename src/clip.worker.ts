import { pipeline } from "@xenova/transformers";

let extractor: any = null;

self.addEventListener("message", async (event) => {
  const { type, requestId, image } = event.data;

  try {
    if (type === "LOAD_MODEL") {
      extractor = await pipeline(
        "feature-extraction",
        "Xenova/clip-vit-base-patch32",
        {
          progress_callback(progress) {
            self.postMessage({
              type: "MODEL_PROGRESS",
              progress: progress.progress || 0,
            });
          },
        }
      );

      self.postMessage({
        type: "MODEL_READY",
      });

      return;
    }

    if (type === "EXTRACT_VECTOR") {
      const output = await extractor(image, {
        pooling: "mean",
        normalize: true,
      });

      const vector = Array.from(output.data);

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
      error:
        error instanceof Error
          ? error.message
          : "Unknown Error",
    });
  }
});

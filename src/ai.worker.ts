import { pipeline, RawImage } from '@xenova/transformers';

let extractor: any = null;

// Lắng nghe thông điệp từ Main Thread
self.onmessage = async (event) => {
  const { type, image } = event.data;

  if (type === 'LOAD_MODEL') {
    try {
      // Tải mô hình CLIP - Một trong những model AI tốt nhất cho Image Search
      extractor = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');
      self.postMessage({ type: 'MODEL_READY' });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: (error as Error).message });
    }
  }

  if (type === 'EXTRACT_VECTOR') {
    if (!extractor) {
      self.postMessage({ type: 'ERROR', error: 'Model chưa được tải!' });
      return;
    }

    try {
      // Xử lý hình ảnh sang định dạng AI hiểu được
      const rawImage = await RawImage.fromURL(image);
      const output = await extractor(rawImage);
      
      // Lấy vector đặc trưng 512 chiều
      const embedding = Array.from(output.data);
      self.postMessage({ type: 'VECTOR_READY', vector: embedding });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: (error as Error).message });
    }
  }
};

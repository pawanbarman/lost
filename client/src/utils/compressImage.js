const MAX_EDGE = 1500;
const MAX_BYTES = 1024 * 1024;
const OUTPUT_TYPE = 'image/jpeg';

const toBlobFromCanvas = (canvas, type, quality) =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });

export const compressImage = async (file, { maxEdge = MAX_EDGE, maxBytes = MAX_BYTES } = {}) => {
  if (!file) return null;
  if (!file.type.startsWith('image/')) return file;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

    let quality = 0.8;
    let blob = await toBlobFromCanvas(canvas, OUTPUT_TYPE, quality);
    while (blob && blob.size > maxBytes && quality > 0.3) {
      quality -= 0.1;
      blob = await toBlobFromCanvas(canvas, OUTPUT_TYPE, quality);
    }
    if (!blob) return file;

    const baseName = (file.name || 'photo').replace(/\.[^./]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: OUTPUT_TYPE });
  } catch (err) {
    console.warn('Image compression failed, sending original:', err);
    return file;
  }
};
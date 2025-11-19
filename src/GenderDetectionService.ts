import '@tensorflow/tfjs';
import * as faceapi from 'face-api.js';

export class GenderDetectionService {
  private modelsPromise: Promise<void> | null = null;
  private backendPromise: Promise<void> | null = null;
  private envPatched = false;
  private tfFetchPatched = false;
  private readonly modelPath: string;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  async detect(imageData: string) {
    try {
      await this.ensureModelsLoaded();
      const img = await this.loadImageFromDataUrl(imageData);
      const detectionCanvas = this.createDetectionCanvas(img);
      const detections = await faceapi
        .detectAllFaces(detectionCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withAgeAndGender();

      if (!detections.length) {
        console.info('Gender detection: no faces detected.');
        return;
      }

      detections.forEach((detection, index) => {
        const probability = (detection.genderProbability * 100).toFixed(1);
        console.info(`Gender detection [${index + 1}]: ${detection.gender} (${probability}%)`);
      });
    } catch (error) {
      console.error('Gender detection failed:', error);
    }
  }

  private async ensureModelsLoaded() {
    this.ensureEnvPatched();
    await this.ensureBackendReady();
    if (!this.modelsPromise) {
      this.modelsPromise = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(this.modelPath),
        faceapi.nets.ageGenderNet.loadFromUri(this.modelPath)
      ])
        .then(() => {
          console.info('face-api.js models loaded for gender detection.');
        })
        .catch((error) => {
          this.modelsPromise = null;
          throw error;
        });
    }
    return this.modelsPromise;
  }

  private async ensureBackendReady() {
    this.ensureTfFetchPatched();
    if (!this.backendPromise) {
      this.backendPromise = (async () => {
        try {
          await faceapi.tf.setBackend('webgl');
          await faceapi.tf.ready();
        } catch (error) {
          console.warn('WebGL backend init failed, falling back to CPU backend for face-api.js', error);
          await faceapi.tf.setBackend('cpu');
          await faceapi.tf.ready();
        }
      })().catch((error) => {
        this.backendPromise = null;
        throw error;
      });
    }
    return this.backendPromise;
  }

  private ensureEnvPatched() {
    if (this.envPatched) return;
    const nativeFetch = window.fetch ? window.fetch.bind(window) : undefined;
    if (!nativeFetch) {
      console.warn('Browser fetch implementation missing; face-api.js may not load models correctly.');
    }
    try {
      faceapi.env.monkeyPatch({
        fetch: nativeFetch,
        Canvas: HTMLCanvasElement,
        Image: HTMLImageElement,
        createCanvasElement: () => document.createElement('canvas'),
        createImageElement: () => document.createElement('img')
      });
      this.envPatched = true;
    } catch (error) {
      console.warn('Failed to monkey patch face-api.js environment.', error);
    }
  }

  private ensureTfFetchPatched() {
    if (this.tfFetchPatched) return;
    const nativeFetch = window.fetch ? window.fetch.bind(window) : undefined;
    if (!nativeFetch) return;
    try {
      const platformFetch = faceapi?.tf?.env().platform?.fetch;
      if (platformFetch !== nativeFetch) {
        faceapi.tf.env().platform.fetch = nativeFetch;
      }
      this.tfFetchPatched = true;
    } catch (error) {
      console.warn('Failed to override TensorFlow.js fetch implementation.', error);
    }
  }

  private loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (error) => reject(error);
      image.src = dataUrl;
    });
  }

  private createDetectionCanvas(img: HTMLImageElement): HTMLCanvasElement {
    const MAX_INPUT = 512;
    const largestDimension = Math.max(img.width, img.height) || 1;
    const scale = largestDimension > MAX_INPUT ? MAX_INPUT / largestDimension : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to obtain canvas context for gender detection.');
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
}


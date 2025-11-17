import {
  bootstrapCameraKit,
  CameraKitSession,
  createMediaStreamSource,
  Transform2D
} from '@snap/camera-kit';
import { APP_CONFIG } from './AppConfig';

let cameraKitSession: CameraKitSession;
let mediaStream: MediaStream;
let { LensesGroup }: any = {}; // Replace 'any' with the appropriate type if available
const camerakitCanvas = document.getElementById('CameraKit-AR-Canvas') as HTMLCanvasElement;
let captureBtn: HTMLButtonElement;
let capturedImageData: string | null = null;
let downloadImageBtn: HTMLButtonElement;
let closePreviewBtn: HTMLButtonElement;

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Camera Kit
  await initCameraKit();
})

// Initialize Camera Kit
async function initCameraKit() {
  let loadedLensesCount: number = 0;
  try {
    const cameraKit = await bootstrapCameraKit({ apiToken: APP_CONFIG.CAMERA_KIT_API_TOKEN });
    cameraKitSession = await cameraKit.createSession({ liveRenderTarget: camerakitCanvas });
    { LensesGroup = await cameraKit.lensRepository.loadLensGroups([APP_CONFIG.LENS_GROUP_ID]) };
    LensesGroup.lenses.forEach((lens: any) => {
      cameraKitSession.applyLens(lens).then(() => {
        loadedLensesCount++;
        if (loadedLensesCount === LensesGroup.lenses.length) {
          console.log(`Loaded ${loadedLensesCount} lenses`);
          // Hide loader immediately and start splash fade-out
          hideSplashLoader();
          setCameraKitSource(cameraKitSession, true); // Use back camera for Image Target
          setTimeout(() => {
            setupCaptureUI();
          }, 500);
        }
      });
    });
  } catch (error) {
    console.error('Failed to initialize CameraKit:', error);
  }
}

function setupCaptureUI() {
  captureBtn = document.getElementById('capture-btn') as HTMLButtonElement;
  downloadImageBtn = document.getElementById('download-btn') as HTMLButtonElement;
  closePreviewBtn = document.getElementById('close-btn') as HTMLButtonElement;
  captureBtn.style.display = 'flex';
  captureBtn.addEventListener('click', capturePhoto);
  closePreviewBtn.addEventListener('click', ClosePreview);
  downloadImageBtn.addEventListener('click', DownloadImage);
}


//@ts-ignore
async function setCameraKitSource(
  session: CameraKitSession,
  isFront: boolean = true) {

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: isFront ? "user" : "environment" }
  });

  const source = createMediaStreamSource(mediaStream, {
    cameraType: isFront ? 'user' : 'environment'
  });

  await session.setSource(source);
  // Only apply mirror transform for front camera
  if (isFront) {
    source.setTransform(Transform2D.MirrorX);
  }
  session.play();
  source.setRenderSize(1080, 1920);
}

// Function to hide the splash loader
function hideSplashLoader() {
  const loader = document.getElementById('splash-loader');
  document.body.classList.add('splash-hidden');
  if (loader) loader.style.display = 'none';
}

function capturePhoto() {
  if (!camerakitCanvas) {
    console.error('Canvas not found');
    return;
  }
  try {
    // Capture the current canvas content
    capturedImageData = camerakitCanvas.toDataURL('image/png');
    // Get the photo canvas and display the captured photo
    const photoPreviewCanvas = document.getElementById('photo-preview-canvas') as HTMLCanvasElement;
    if (photoPreviewCanvas) {
      // Set canvas dimensions to match the captured image
      photoPreviewCanvas.width = camerakitCanvas.width;
      photoPreviewCanvas.height = camerakitCanvas.height;

      // Get the 2D context and draw the captured photo
      const ctx = photoPreviewCanvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          // Clear the canvas and draw the captured image
          ctx.clearRect(0, 0, photoPreviewCanvas.width, photoPreviewCanvas.height);
          ctx.drawImage(img, 0, 0);

          // Show the photo canvas, hide the main canvas
          photoPreviewCanvas.style.display = 'block';
          photoPreviewCanvas.style.width = '100%';
          photoPreviewCanvas.style.height = '100%';
          photoPreviewCanvas.style.objectFit = 'contain';
          photoPreviewCanvas.style.position = 'absolute';  // Match live canvas positioning if it uses absolute
          camerakitCanvas.style.display = 'none';
        };
        img.src = capturedImageData;
      }
    }

    // Hide capture button, show download and close buttons
    if (captureBtn) captureBtn.style.display = 'none';
    if (downloadImageBtn) downloadImageBtn.style.display = 'flex';
    if (closePreviewBtn) closePreviewBtn.style.display = 'flex';

  } catch (error) {
    console.error('Failed to capture photo:', error);
  }
}

function ClosePreview() {
  // Clear the captured image
  capturedImageData = null;

  // Hide photo preview canvas, show main canvas
  let previewCanvas = document.getElementById('photo-preview-canvas');
  if (previewCanvas) {
    previewCanvas.style.display = 'none';
  }

  if (camerakitCanvas) {
    camerakitCanvas.style.display = 'block';
  }

  // Hide download and close buttons

  if (downloadImageBtn) downloadImageBtn.style.display = 'none';
  if (closePreviewBtn) closePreviewBtn.style.display = 'none';
  ``
  // Show capture button again
  if (captureBtn) captureBtn.style.display = 'flex';
}

function DownloadImage() {
if (capturedImageData) {
    const a = document.createElement('a');
    a.href = capturedImageData;
    a.download = `photo-preview-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
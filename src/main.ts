import {
  bootstrapCameraKit,
  CameraKitSession,
  createMediaStreamSource,
  Transform2D,
  type Lens
} from '@snap/camera-kit';
import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type GenerateContentResponse,
  type GenerateContentRequest
} from '@google/generative-ai';
import { GenderDetectionService } from './GenderDetectionService';
import { APP_CONFIG } from './AppConfig';

let cameraKitSession: CameraKitSession;
let mediaStream: MediaStream;
const camerakitCanvas = document.getElementById('CameraKit-AR-Canvas') as HTMLCanvasElement;
let captureBtn: HTMLButtonElement;
let capturedImageData: string | null = null;
let downloadImageBtn: HTMLButtonElement;
let closePreviewBtn: HTMLButtonElement;
let sendToGeminiBtn: HTMLButtonElement;
let isSendingToGemini = false;
let geminiModel: GenerativeModel | null = null;
let modeOverlay: HTMLDivElement;
let arModeBtn: HTMLButtonElement;
let aiModeBtn: HTMLButtonElement;
let backBtn: HTMLButtonElement;
let loadingOverlay: HTMLDivElement | null = null;
let selectedMode: 'AR' | 'AI' | null = null;
let currentLens: Lens;
let cameraKit: any;
let gfnb: any;
const FACE_API_MODEL_PATH = `${import.meta.env.BASE_URL}models`;
const genderDetectionService = new GenderDetectionService(FACE_API_MODEL_PATH);
let detectedGender: any

document.addEventListener('DOMContentLoaded', async () => {
  setupModeSelectionUI();
  // Initialize Camera Kit
  await initCameraKit();
})

// Initialize Camera Kit
async function initCameraKit() {
  try {
    await fetchGeminiKey();
    cameraKit = await bootstrapCameraKit({ apiToken: APP_CONFIG.CAMERA_KIT_API_TOKEN });
    cameraKitSession = await cameraKit.createSession({ liveRenderTarget: camerakitCanvas });
    // Hide loader immediately and start splash fade-out
    hideSplashLoader();
    setCameraKitSource(cameraKitSession, true); // Use back camera for Image Target
    setTimeout(() => {
      setupCaptureUI();
    }, 500);
  } catch (error) {
    console.error('Failed to initialize CameraKit:', error);
  }
}

function setupCaptureUI() {
  captureBtn = document.getElementById('capture-btn') as HTMLButtonElement;
  downloadImageBtn = document.getElementById('download-btn') as HTMLButtonElement;
  closePreviewBtn = document.getElementById('close-btn') as HTMLButtonElement;
  sendToGeminiBtn = document.getElementById('send-gemini-btn') as HTMLButtonElement;
  backBtn = document.getElementById('back-btn') as HTMLButtonElement;
  loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
  captureBtn.style.display = 'flex';
  captureBtn.addEventListener('click', capturePhoto);
  closePreviewBtn.addEventListener('click', ClosePreview);
  downloadImageBtn.addEventListener('click', DownloadImage);
  sendToGeminiBtn.addEventListener('click', sendImageToGemini);
  backBtn.addEventListener('click', BackBtnClk);
}

//@ts-ignore
async function fetchGeminiKey() {
  const res = await fetch("https://orange-gem-api.vercel.app/api/get-key");
  const data = await res.json();
  gfnb = data.key;
  // console.log("Key from serverless:", data.key);
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
  showModeSelectionOverlay();
}

function capturePhoto() {
  if (!camerakitCanvas) {
    console.error('Canvas not found');
    return;
  }
  try {
    // Capture the current canvas content
    capturedImageData = camerakitCanvas.toDataURL('image/png');
    renderPreviewCanvas(capturedImageData);

    // Hide capture button, show download and close buttons
    if (captureBtn) captureBtn.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (selectedMode === 'AR')
      if (downloadImageBtn) downloadImageBtn.style.display = 'flex';
    if (closePreviewBtn) closePreviewBtn.style.display = 'flex';
    if (sendToGeminiBtn && selectedMode === 'AI') sendToGeminiBtn.style.display = 'flex';
    if (selectedMode === 'AI' && capturedImageData) {
      detectGenderFromCapture(capturedImageData);
    }

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
  if (sendToGeminiBtn) {
    sendToGeminiBtn.style.display = 'none';
    sendToGeminiBtn.disabled = false;
    if (backBtn) backBtn.style.display = 'flex';
  }
  // Show capture & Back buttons again
  if (captureBtn) captureBtn.style.display = 'flex';
  if (selectedMode === 'AR')
    if (backBtn) backBtn.style.display = 'flex';
}

function BackBtnClk() {
  if (selectedMode === 'AR') {
    cameraKitSession.removeLens();
  }
  backBtn.style.display = 'none';
  selectedMode = null;
  showModeSelectionOverlay();
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

function renderPreviewCanvas(imageData: string) {
  const photoPreviewCanvas = document.getElementById('photo-preview-canvas') as HTMLCanvasElement;
  if (!photoPreviewCanvas) {
    console.warn('Photo preview canvas missing');
    return;
  }

  photoPreviewCanvas.width = camerakitCanvas.width;
  photoPreviewCanvas.height = camerakitCanvas.height;

  const ctx = photoPreviewCanvas.getContext('2d');
  if (!ctx) {
    console.warn('Cannot get canvas context');
    return;
  }

  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, photoPreviewCanvas.width, photoPreviewCanvas.height);
    ctx.drawImage(img, 0, 0, photoPreviewCanvas.width, photoPreviewCanvas.height);
    photoPreviewCanvas.style.display = 'block';
    photoPreviewCanvas.style.width = '100%';
    photoPreviewCanvas.style.height = '100%';
    photoPreviewCanvas.style.objectFit = 'contain';
    photoPreviewCanvas.style.position = 'absolute';
    camerakitCanvas.style.display = 'none';
  };
  img.src = imageData;
}

function detectGenderFromCapture(imageData: string) {
  genderDetectionService.detect(imageData).then((val) => { detectedGender = val; });
}

async function sendImageToGemini() {
  if (!capturedImageData || !sendToGeminiBtn || isSendingToGemini) {
    return;
  }

  const model = ensureGeminiModel();
  if (!model) {
    console.warn('Missing Gemini API key in APP_CONFIG');
    alert('Add your Gemini API key to APP_CONFIG.GEMINI_API_KEY before sending the photo.');
    return;
  }

  isSendingToGemini = true;
  toggleGeminiButtonState(true, 'Sending…');
  showLoadingOverlay();
  sendToGeminiBtn.style.display = 'none';
  const base64Payload = capturedImageData.split(',')[1];

  try {
    const request = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: detectedGender === 'male' ? APP_CONFIG.GEMINI_IMAGE_PROMPT_M : APP_CONFIG.GEMINI_IMAGE_PROMPT_F },
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Payload
              }
            }
          ]
        }
      ],
      generationConfig: {
        imageConfig: {
          aspectRatio: '9:16'
        },
        responseModalities: ['Image']
      }
    } as unknown as GenerateContentRequest;

    const result = await model.generateContent(request);

    const processedImageBase64 = getInlineImageFromGemini(result.response);
    if (processedImageBase64) {
      const dataUrl = `data:image/png;base64,${processedImageBase64}`;
      capturedImageData = dataUrl;
      renderPreviewCanvas(dataUrl);
      console.info('Gemini returned a processed image.');
      sendToGeminiBtn.style.display = 'none';
      downloadImageBtn.style.display = 'flex';
      hideLoadingOverlay();
    } else {
      console.info('Gemini response:', result);
      alert('Gemini responded without an image. Check console for details.');
    }
  } catch (error) {
    console.error('Failed to send image to Gemini:', error);
    alert('Failed to send image to Gemini. Check console for details.');
  } finally {
    isSendingToGemini = false;
    toggleGeminiButtonState(false, 'Send to Gemini');
    hideLoadingOverlay();
    if (downloadImageBtn) downloadImageBtn.style.display = 'flex';
  }
}

function showLoadingOverlay() {
  try {
    if (!loadingOverlay) loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
    if (!loadingOverlay) return;
    loadingOverlay.style.display = 'flex';
    loadingOverlay.setAttribute('aria-hidden', 'false');
  } catch (e) {
  }
}

function hideLoadingOverlay() {
  try {
    if (!loadingOverlay) loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
    if (!loadingOverlay) return;
    loadingOverlay.style.display = 'none';
    loadingOverlay.setAttribute('aria-hidden', 'true');
  } catch (e) {
    // noop
  }
}

function toggleGeminiButtonState(disabled: boolean, label: string) {
  if (!sendToGeminiBtn) return;
  sendToGeminiBtn.disabled = disabled;
  sendToGeminiBtn.textContent = label;
}

function getInlineImageFromGemini(result: GenerateContentResponse | undefined): string | null {
  const candidates = result?.candidates;
  if (!Array.isArray(candidates)) return null;

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (part?.inlineData?.data) {
        return part.inlineData.data;
      }
    }
  }

  return null;
}

function ensureGeminiModel(): GenerativeModel | null {
  if (!gfnb) {
    return null;
  }

  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(gfnb);
    geminiModel = genAI.getGenerativeModel({
      model: APP_CONFIG.GEMINI_MODEL
    });
  }

  return geminiModel;
}

function setupModeSelectionUI() {
  modeOverlay = document.getElementById('mode-selection-overlay') as HTMLDivElement;
  arModeBtn = document.getElementById('mode-ar-btn') as HTMLButtonElement;
  aiModeBtn = document.getElementById('mode-ai-btn') as HTMLButtonElement;

  if (arModeBtn) arModeBtn.addEventListener('click', () => handleModeSelection('AR'));
  if (aiModeBtn) aiModeBtn.addEventListener('click', () => handleModeSelection('AI'));
}

function showModeSelectionOverlay() {
  if (!modeOverlay || selectedMode) return;
  modeOverlay.style.display = 'flex';
}

function hideModeSelectionOverlay() {
  if (!modeOverlay) return;
  modeOverlay.style.display = 'none';
}

async function handleModeSelection(mode: 'AR' | 'AI') {
  selectedMode = mode;
  hideModeSelectionOverlay();
  console.info(`Mode selected: ${mode}`);
  if (backBtn) backBtn.style.display = 'flex';

  if (mode === 'AR') {
    showLoadingOverlay();
    currentLens = await cameraKit.lensRepository.loadLens(APP_CONFIG.LENS_ID, APP_CONFIG.LENS_GROUP_ID);
    await cameraKitSession.applyLens(currentLens).then(() => {
      console.info('AR Lens applied successfully.');
      hideLoadingOverlay();
    });
  }
}
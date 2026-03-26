/**
 * hand-tracker.js
 * MediaPipe Hands를 초기화하고, 손목(landmark 0)의
 * 정규화된 X 좌표(0~1)를 외부에 콜백으로 전달합니다.
 */

class HandTracker {
  constructor() {
    this.onHandMove   = null; // ({ x, y }: 0~1 each) => void
    this.onHandDetect = null; // (detected: bool)      => void
    this._hands       = null;
    this._camera      = null;
    this._videoEl     = null;
    this._running     = false;
    this._lastX       = 0.5;
    this._lastY       = 0.8;
    this._detected    = false;
  }

  /** videoElement: <video id="webcam"> */
  async init(videoElement) {
    this._videoEl = videoElement;

    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,       // 0 = lite (빠름), 1 = full
      minDetectionConfidence: 0.6,
      minTrackingConfidence:  0.5,
    });

    this._hands.onResults((results) => this._onResults(results));

    this._camera = new Camera(videoElement, {
      onFrame: async () => {
        if (this._running) {
          await this._hands.send({ image: videoElement });
        }
      },
      width:  640,
      height: 480,
    });

    await this._camera.start();
    this._running = true;
  }

  stop() {
    this._running = false;
    if (this._camera) this._camera.stop();
  }

  _onResults(results) {
    const detected =
      results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    if (detected !== this._detected) {
      this._detected = detected;
      if (this.onHandDetect) this.onHandDetect(detected);
    }

    if (!detected) return;

    // landmark 0 = 손목 중심
    const wrist = results.multiHandLandmarks[0][0];

    // MediaPipe는 미러되지 않은 좌표를 반환하므로
    // 비디오가 CSS로 좌우반전되어 있어 X를 뒤집어야 합니다.
    const mirroredX = 1 - wrist.x;
    const y         = wrist.y;          // 0 = 화면 위, 1 = 화면 아래

    this._lastX = mirroredX;
    this._lastY = y;
    if (this.onHandMove) this.onHandMove({ x: mirroredX, y });
  }

  get lastX() { return this._lastX; }
  get lastY() { return this._lastY; }
}

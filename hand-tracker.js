/**
 * hand-tracker.js
 * MediaPipe Hands를 초기화하고, 최대 2개 손목 좌표를
 * X 기준으로 정렬해 외부에 콜백으로 전달합니다.
 *
 * onHandMove(hands)
 *   hands[0] = 왼쪽 손 { x, y } 또는 null
 *   hands[1] = 오른쪽 손 { x, y } 또는 null
 */

class HandTracker {
  constructor() {
    this.onHandMove   = null; // (hands: [{x,y}|null, {x,y}|null]) => void
    this.onHandDetect = null; // (count: 0|1|2) => void
    this._hands       = null;
    this._camera      = null;
    this._videoEl     = null;
    this._running     = false;
    this._lastHands   = [null, null];
    this._detectedCount = 0;
  }

  async init(videoElement) {
    this._videoEl = videoElement;

    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
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
    const landmarks = results.multiHandLandmarks || [];
    const count = landmarks.length;

    if (count !== this._detectedCount) {
      this._detectedCount = count;
      if (this.onHandDetect) this.onHandDetect(count);
    }

    if (count === 0) {
      this._lastHands = [null, null];
      if (this.onHandMove) this.onHandMove([null, null]);
      return;
    }

    // 손목(landmark 0) 좌표 추출 — X 미러 처리, 21개 랜드마크 전달
    const points = landmarks.map(lm => ({
      x: 1 - lm[0].x,   // 미러
      y: lm[0].y,
      lms: lm.map(pt => ({ x: 1 - pt.x, y: pt.y })),
    }));

    // X 기준 오름차순 정렬 → [0]=왼쪽(작은 X), [1]=오른쪽(큰 X)
    points.sort((a, b) => a.x - b.x);

    const hands = [
      points[0] || null,
      points[1] || null,
    ];

    this._lastHands = hands;
    if (this.onHandMove) this.onHandMove(hands);
  }

  get lastHands() { return this._lastHands; }

  // 1P 하위 호환용
  get lastX() { return this._lastHands[0]?.x ?? 0.5; }
  get lastY() { return this._lastHands[0]?.y ?? 0.8; }
}

/* =========================================================================
   AudioRecorder
   =========================================================================
   MediaRecorderを薄くラップした共通の録音ユーティリティ。
   声紋の「登録」（5〜10秒の明示的な録音）と、ゲーム中の「はい！」検知時の
   話者判定用キャプチャの両方から使い回す。マイク権限・MediaRecorder非対応
   ブラウザへの対処をここに集約し、呼び出し側（UI・introQuiz.js）は
   常に同じ非同期APIだけを扱えばよいようにする。
   ========================================================================= */

export function isSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !!window.MediaRecorder;
}

export class AudioRecorder {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  async start() {
    if (!isSupported()) throw new Error("recorder-unsupported");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) this.chunks.push(ev.data); };
    this.recorder.start();
  }

  // 録音を止めて Blob を返す
  stop() {
    return new Promise((resolve) => {
      if (!this.recorder) { resolve(null); return; }
      const mimeType = this.recorder.mimeType || "audio/webm";
      this.recorder.onstop = () => {
        this._releaseStream();
        resolve(this.chunks.length ? new Blob(this.chunks, { type: mimeType }) : null);
      };
      try { this.recorder.stop(); } catch (e) { this._releaseStream(); resolve(null); }
    });
  }

  // 録音そのものを破棄する（画面離脱・キャンセル時）
  cancel() {
    try { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop(); } catch (e) {}
    this._releaseStream();
  }

  _releaseStream() {
    if (this.stream) { this.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} }); }
    this.stream = null;
    this.recorder = null;
  }
}

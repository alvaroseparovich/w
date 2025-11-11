// Handles microphone capture and produces a single Blob per session.
// Also manages Record/Stop enable/disable.

export class Recorder {
  constructor({ onStatus } = {}) {
    this.onStatus = onStatus || (() => {});
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
  }

  async start() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.chunks = [];
    this.mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    });
    this.mediaRecorder.start();
    this.onStatus('recording');
  }

  async stop() {
    if (!this.mediaRecorder) return null;
    const mr = this.mediaRecorder;
    const stopped = new Promise(resolve => {
      mr.addEventListener('stop', () => resolve(null), { once: true });
    });
    mr.stop();
    await stopped;
    const blob = new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' });
    // cleanup stream
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.onStatus('idle');
    return blob;
  }
}

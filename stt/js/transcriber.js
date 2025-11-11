// Loads Vosk WASM recognizer and transcribes given audio Blob.
// This module expects Vosk browser files under ../assets/vosk/ and a model under ../assets/model/

// Minimal wrapper, defers actual heavy lifting to the official Vosk browser API.
// We keep the API simple for the UI layer.

export class VoskTranscriber {
  constructor({ basePath = '../assets/vosk', modelPath = '../assets/model' } = {}) {
    this.basePath = basePath;
    this.modelPath = modelPath;
    this.handle = null;
    this.model = null;
  }

  async init() {
    if (this.handle) return; // already loaded

    // Expect window.Vosk to become available from vosk.js.
    await this._loadScript(`${this.basePath}/vosk.js`);

    // Initialize runtime
    const Vosk = window.Vosk;
    if (!Vosk) throw new Error('Vosk runtime not found. Ensure vosk.js is served.');

    await Vosk.createModel(this.modelPath).then(model => {
      this.model = model;
    });

    // Create a recognizer with a default sample rate; UI should resample as needed
    this.handle = await this._createRecognizer(16000);
  }

  async _createRecognizer(sampleRate) {
    if (!this.model) throw new Error('Model not loaded');
    const rec = await this.model.createRecognizer(sampleRate);
    return rec;
  }

  async dispose() {
    try {
      if (this.handle) {
        this.handle.free();
        this.handle = null;
      }
      if (this.model) {
        this.model.free();
        this.model = null;
      }
    } catch {}
  }

  // Transcribe an audio Blob. This implementation uses the browser AudioContext to decode,
  // resamples to 16k mono Float32, then feeds PCM to the recognizer.
  async transcribe(blob) {
    if (!this.handle) throw new Error('Transcriber not initialized');

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const buf = await blob.arrayBuffer();

    // Decode with temporary higher-rate context if 16k fails
    let audioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(buf.slice(0));
    } catch (e) {
      const tmp = new (window.AudioContext || window.webkitAudioContext)();
      const ab = await tmp.decodeAudioData(buf.slice(0));
      audioBuffer = await this._resampleBuffer(ab, 16000);
      tmp.close();
    }

    const mono = this._toMono(audioBuffer);
    const pcm = mono.getChannelData(0);

    // Vosk expects Int16 PCM. Convert Float32 [-1,1] to Int16
    const int16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      let s = Math.max(-1, Math.min(1, pcm[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.handle.reset();
    // Chunk feed to keep UI responsive
    const chunkSize = 4096;
    for (let i = 0; i < int16.length; i += chunkSize) {
      const chunk = int16.subarray(i, i + chunkSize);
      this.handle.acceptWaveform(chunk);
      // allow a frame to render for very large inputs
      if (i % (chunkSize * 32) === 0) await new Promise(r => setTimeout(r));
    }
    const res = this.handle.finalResult();
    const text = (res && res.text) ? res.text.trim() : '';
    return text;
  }

  _toMono(buffer) {
    if (buffer.numberOfChannels === 1) return buffer;
    const len = buffer.length;
    const out = new AudioContext({ sampleRate: buffer.sampleRate }).createBuffer(1, len, buffer.sampleRate);
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);
    const dest = out.getChannelData(0);
    for (let i = 0; i < len; i++) dest[i] = (ch0[i] + ch1[i]) / 2;
    return out;
  }

  async _resampleBuffer(srcBuffer, targetRate) {
    const offline = new OfflineAudioContext(1, Math.ceil(srcBuffer.duration * targetRate), targetRate);
    const src = offline.createBufferSource();
    // to mono first
    const mono = this._toMono(srcBuffer);
    src.buffer = mono;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return rendered;
  }

  _loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load script ${url}`));
      document.head.appendChild(s);
    });
  }
}

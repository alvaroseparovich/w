import { Recorder } from './recorder.js';
import { VoskTranscriber } from './transcriber.js';

const els = {
  record: document.getElementById('recordBtn'),
  stop: document.getElementById('stopBtn'),
  status: document.getElementById('status'),
  items: document.getElementById('items'),
};

const recorder = new Recorder({ onStatus: setStatus });
const transcriber = new VoskTranscriber();

let ready = false;

async function ensureReady() {
  if (ready) return;
  setStatus('Loading model...');
  try {
    await transcriber.init();
    setStatus('Ready');
    ready = true;
  } catch (e) {
    console.error(e);
    setStatus('Failed to load model');
  }
}

function setStatus(text) {
  els.status.textContent = text;
  const isRecording = text === 'recording' || text === 'Recording...';
  els.record.disabled = isRecording;
  els.stop.disabled = !isRecording;
}

els.record.addEventListener('click', async () => {
  await ensureReady();
  try {
    setStatus('Recording...');
    await recorder.start();
  } catch (e) {
    console.error(e);
    setStatus('Mic error');
  }
});

els.stop.addEventListener('click', async () => {
  try {
    const blob = await recorder.stop();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const li = document.createElement('li');
    li.className = 'item';

    const audio = document.createElement('audio');
    audio.className = 'item-audio';
    audio.controls = true;
    audio.src = url;

    const text = document.createElement('div');
    text.className = 'item-text';
    text.textContent = 'Transcribing...';

    li.append(audio, text);
    els.items.prepend(li);

    // Transcribe async
    const transcript = await transcriber.transcribe(blob);
    text.textContent = transcript || '(no speech detected)';
  } catch (e) {
    console.error(e);
    setStatus('Error');
  } finally {
    if (ready) setStatus('Ready');
  }
});

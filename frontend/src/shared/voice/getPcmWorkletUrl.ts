// OpenWhispr's capture worklet, ported near-verbatim (MIT): 800-sample Int16 buffers (50ms at
// 16kHz) posted with transferables off the audio thread, plus a "stop" -> drain -> "flushed"
// handshake so the tail of an utterance is never lost at teardown. Replaces the deprecated
// main-thread ScriptProcessorNode.
const WORKLET_SOURCE = `
const BUFFER_SIZE = 800;
class PCMStreamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(BUFFER_SIZE);
    this.offset = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data === "stop") {
        if (this.offset > 0) {
          const partial = this.buffer.slice(0, this.offset);
          this.port.postMessage(partial.buffer, [partial.buffer]);
          this.buffer = new Int16Array(BUFFER_SIZE);
          this.offset = 0;
        }
        this.port.postMessage("flushed");
        this.stopped = true;
      }
    };
  }
  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.offset >= BUFFER_SIZE) {
        this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
        this.buffer = new Int16Array(BUFFER_SIZE);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-streaming-processor", PCMStreamingProcessor);
`;

let cachedUrl: string | null = null;

export function getPcmWorkletUrl(): string {
  if (!cachedUrl) cachedUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  return cachedUrl;
}

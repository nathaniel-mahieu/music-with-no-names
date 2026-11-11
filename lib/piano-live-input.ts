export type PianoFramePublisher = {
  schedule: () => void;
  flush: () => void;
  cancel: () => void;
};

/** Coalesce view publication, not raw MIDI recording, to the next paint frame. */
export function createPianoFramePublisher(
  publish: () => void,
  requestFrame: (callback: () => void) => number,
  cancelFrame: (id: number) => void,
): PianoFramePublisher {
  let pendingFrame: number | null = null;
  let generation = 0;

  const cancel = () => {
    if (pendingFrame === null) return;
    const frame = pendingFrame;
    pendingFrame = null;
    generation += 1;
    cancelFrame(frame);
  };

  return {
    schedule() {
      if (pendingFrame !== null) return;
      const ticket = ++generation;
      pendingFrame = requestFrame(() => {
        if (ticket !== generation || pendingFrame === null) return;
        pendingFrame = null;
        publish();
      });
    },
    flush() {
      if (pendingFrame === null) return;
      cancel();
      publish();
    },
    cancel,
  };
}

/** Keep the browser's original onset clock when queued MIDI delivery is late. */
export function midiMessageTimeStamp(timeStamp: number | undefined, receivedAtMs: number) {
  return timeStamp !== undefined && Number.isFinite(timeStamp)
    && timeStamp > 0 && timeStamp <= receivedAtMs + 1
    ? timeStamp
    : receivedAtMs;
}

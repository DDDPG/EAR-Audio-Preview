import { decodeAacLocally } from "./aacDecodeCore";
const scope = self as unknown as {
  onmessage: (event: MessageEvent<{ data: Uint8Array; ext: string }>) => void;
  postMessage: (message: unknown, transfer: ArrayBuffer[]) => void;
};
scope.onmessage = (event) => {
  void decodeAacLocally(event.data.data, event.data.ext).then(
    (result) =>
      scope.postMessage(
        { result },
        result.channelData.map((channel) => channel.buffer),
      ),
    (error) =>
      scope.postMessage(
        { error: error instanceof Error ? error.message : String(error) },
        [],
      ),
  );
};

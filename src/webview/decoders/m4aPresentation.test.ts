/** @jest-environment node */
import * as fs from "fs";
import * as path from "path";
import { m4aPresentation } from "./m4aPresentation";

function box(type: string, ...parts: Buffer[]): Buffer {
  const content = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(content.length + 8);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, content]);
}
function iTunesFile(text: string): Uint8Array {
  const handler = Buffer.alloc(12);
  handler.write("soun", 8);
  return box(
    "moov",
    box("trak", box("mdia", box("hdlr", handler))),
    box(
      "udta",
      box(
        "meta",
        Buffer.alloc(4),
        box(
          "ilst",
          box(
            "----",
            box("name", Buffer.alloc(4), Buffer.from("iTunSMPB")),
            box("data", Buffer.alloc(8), Buffer.from(text)),
          ),
        ),
      ),
    ),
  );
}

test("Apple iTunSMPB trims priming and padding to the exact valid sample count", () => {
  const bytes = iTunesFile(
    " 00000000 00000840 000001C0 000000000008CA00 00000000",
  );
  expect(m4aPresentation(bytes, 48000, 578560)).toEqual({
    start: 2112,
    length: 576000,
  });
  expect(() => m4aPresentation(bytes, 48000, 578559)).toThrow(/does not match/);
});

test("malformed gapless metadata is rejected rather than silently using encoded padding", () => {
  expect(() => m4aPresentation(iTunesFile("bad metadata"), 48000, 10)).toThrow(
    /gapless metadata/,
  );
});

test("multiple M4A edits and truncated containers are rejected explicitly", () => {
  const bytes = new Uint8Array(
    fs.readFileSync(
      path.join(
        __dirname,
        "../../__fixtures__/codec-compatibility/reference-stereo-48000.m4a",
      ),
    ),
  );
  const edit = Buffer.from(bytes).indexOf("elst");
  new DataView(bytes.buffer).setUint32(edit + 8, 2);
  expect(() => m4aPresentation(bytes, 48000)).toThrow(/only one M4A edit/);
  expect(() => m4aPresentation(bytes.subarray(0, 13), 48000)).toThrow(/box/);
});

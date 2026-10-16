// Aurora's Node entry pulls playback devices and optional native bindings.
// Decode only local in-memory buffers, using the published JavaScript files.
exports.Buffer = require("av/src/core/buffer.js");
exports.Stream = require("av/src/core/stream.js");
exports.Bitstream = require("av/src/core/bitstream.js");
exports.Demuxer = require("av/src/demuxer.js");
exports.Decoder = require("av/src/decoder.js");
exports.Asset = require("av/src/asset.js");
require("av/src/demuxers/m4a.js");

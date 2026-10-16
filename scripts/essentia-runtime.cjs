// Bundle only the API used by the extension. The package root also loads
// plotting, ML and extractor add-ons that are never used by this project.
exports.Essentia = require("essentia.js/dist/essentia.js-core.umd.js");
exports.EssentiaWASM = require("essentia.js/dist/essentia-wasm.umd.js");

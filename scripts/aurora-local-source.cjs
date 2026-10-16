// Asset.fromBuffer is the only supported source in the offline decoder worker.
module.exports = class LocalBuffersOnly {
  constructor() {
    throw new Error("AAC decoder accepts local in-memory audio only");
  }
};

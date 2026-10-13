"use strict";
// BedrockProvider: STUB (design §6.3). Off by default and not functional in this build. It keeps the
// cloud gate open at the configuration level without installing anything or touching the network.
//
// Plan for the real implementation (also in README > Switching providers):
// - Package @aws-sdk/client-bedrock-runtime, exact version pinned at the time
//   (npm install --save-exact), required only from this file.
// - Credentials come from the AWS SDK default credential provider chain on the SERVER only
//   (process environment, ~/.aws profile / SSO, or the Lambda execution role). Never in config.json
//   (lib/config.js rejects credential-like keys), never in the browser, never in responses or logs.
// - Least-privilege IAM: bedrock:InvokeModel on the one configured model ARN only.
// - ConverseCommand with modelId = bedrock.modelId, inferenceConfig {temperature: 0.1, maxTokens: 1800},
//   the same system/user prompts as Ollama; the JSON comes back as text and goes through the same
//   validator/repair in lib/explain-service.js. Region from bedrock.region.
// - Disclosure: in cloud mode the French text leaves the Mac and is processed by AWS in that region;
//   health reports dataLeavesDevice:true and the UI shows a cloud-mode notice.
// - Exposing the Explainer beyond localhost additionally REQUIRES authentication (see design §6.4).
//
// This file must not require any package outside node: built-ins and lib/.

const { AppError } = require("../errors");

const STUB_HINT = "Bedrock provider is a stub in this build.";

class BedrockProvider {
  /** @param {{enabled?: boolean, region?: string, modelId?: string}} bedrockConfig  config.bedrock */
  constructor(bedrockConfig = {}) {
    this.id = "bedrock";
    this.cfg = { enabled: false, ...(bedrockConfig || {}) };
  }

  missingFields() {
    const missing = [];
    if (!this.cfg.region) missing.push("bedrock.region");
    if (!this.cfg.modelId) missing.push("bedrock.modelId");
    return missing;
  }

  isConfigured() {
    return this.cfg.enabled === true && this.missingFields().length === 0;
  }

  describe() {
    return {
      provider: "bedrock",
      model: this.cfg.modelId || null,
      region: this.cfg.region || null,
      mode: "cloud",
      dataLeavesDevice: true,
    };
  }

  async health() {
    // No network call: the stub cannot serve requests, so it is never ready in this build.
    return {
      reachable: false,
      version: null,
      modelAvailable: false,
      ready: false,
      configured: this.isConfigured(),
      hint: STUB_HINT,
    };
  }

  async complete() {
    if (this.cfg.enabled !== true) throw new AppError("PROVIDER_NOT_CONFIGURED");
    const missing = this.missingFields();
    if (missing.length > 0) {
      throw new AppError(
        "PROVIDER_NOT_CONFIGURED",
        `The Bedrock provider is enabled but not fully configured. Missing: ${missing.join(", ")} ` +
          "(see README > Switching providers)."
      );
    }
    throw new AppError("PROVIDER_NOT_IMPLEMENTED");
  }
}

module.exports = { BedrockProvider };

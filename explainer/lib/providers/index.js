"use strict";
// createProvider(config): picks the provider named by config.provider (design §6.1).

const { OllamaProvider } = require("./ollama");
const { BedrockProvider } = require("./bedrock");

/**
 * @param {{provider: "ollama"|"bedrock", ollama?: object, bedrock?: object, limits?: {modelTimeoutMs?: number}}} config
 * @param {{log?: object}} [opts]
 */
function createProvider(config, { log } = {}) {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config.ollama, {
        modelTimeoutMs: config.limits && config.limits.modelTimeoutMs,
        log,
      });
    case "bedrock":
      return new BedrockProvider(config.bedrock);
    default:
      throw new Error(`Unknown provider: ${String(config.provider)}`);
  }
}

module.exports = { createProvider };

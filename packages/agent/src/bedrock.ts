/**
 * TODO(Saransh): Bedrock Converse tool-use loop (Task 8) + grounding/fallback (Task 9).
 *
 * Plan:
 *  - @aws-sdk/client-bedrock-runtime ConverseCommand, model from BEDROCK_MODEL_ID.
 *  - Loop: send messages + toolConfig(TOOL_NAMES) -> execute toolUse blocks -> append
 *    toolResult -> repeat until submit_alert or maxTurns.
 *  - Record every call in AlertCardData.toolTrace (handoff H9).
 *  - Validate output with AlertCardDataSchema and check that every number matches the
 *    EngineResult; otherwise fall back to buildTemplateAlert.
 *  - Tests: aws-sdk-client-mock with scripted tool sequences; RUN_BEDROCK=1 for real calls.
 */
export const BEDROCK_DEFAULTS = {
  region: 'us-east-1',
  maxTurns: 8,
  timeoutMs: 8_000,
} as const;

/**
 * SSE protocol for production launch job stream.
 */

import type { LaunchStep, LaunchStepId, ProductionLaunchResult } from "./launch-pipeline";

export type LaunchSseEventType =
  | "step"
  | "progress"
  | "checkout"
  | "done"
  | "error";

export type LaunchSsePayloadMap = {
  step: LaunchStep;
  progress: { pct: number; label: string };
  checkout: { url: string; plan: "PRO" | "ENTERPRISE" };
  done: ProductionLaunchResult;
  error: { message: string; stepId?: LaunchStepId; retryable?: boolean };
};

export function encodeLaunchSse<T extends LaunchSseEventType>(
  type: T,
  data: LaunchSsePayloadMap[T],
): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

import {
  WINDOW_CHANNEL,
  WindowNotificationSchema,
  WindowRequestSchema,
  WindowResponseSchema,
  type WindowNotification,
  type WindowRequest,
  type WindowResponse,
} from "./messages.ts";

export { WINDOW_CHANNEL };

export function isWindowRequest(data: unknown): data is WindowRequest {
  return WindowRequestSchema.safeParse(data).success;
}

export function isWindowResponse(data: unknown): data is WindowResponse {
  return WindowResponseSchema.safeParse(data).success;
}

export function isWindowNotification(data: unknown): data is WindowNotification {
  return WindowNotificationSchema.safeParse(data).success;
}

export function postToPage(response: WindowResponse): void {
  window.postMessage(response, "*");
}

export function postToBridge(request: WindowRequest): void {
  window.postMessage(request, "*");
}

export function postToPageNotification(notification: WindowNotification): void {
  window.postMessage(notification, "*");
}

import {
  getSecurityEventMetadata,
  type SecurityEventMetadata,
} from "@/lib/security/embed-access";
import { sendSecurityAlert } from "@/lib/notifications/security-alerts";

export async function logUnauthorizedEmbedAccess(
  headers: Headers,
  path: string,
  reason: string
) {
  const event = getSecurityEventMetadata(headers, path, reason);

  logSecurityEvent(event);
  await sendSecurityAlert(event);
}

function logSecurityEvent(event: SecurityEventMetadata) {
  console.warn(
    "Unauthorized iframe access attempt",
    JSON.stringify(
      {
        time: event.timestamp,
        path: event.path,
        origin: event.detectedOrigin,
        referer: event.referer,
        refererOrigin: event.refererOrigin,
        userAgent: event.userAgent,
        ip: event.ip,
        clientId: event.clientId,
        reason: event.reason,
      },
      null,
      2
    )
  );
}

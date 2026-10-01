import type { SecurityEventMetadata } from "@/lib/security/embed-access";

const DEFAULT_COOLDOWN_SECONDS = 3600;

type GlobalSecurityAlertState = {
  lastSecurityAlertAt?: number;
};

const globalSecurityAlertState = globalThis as typeof globalThis &
  GlobalSecurityAlertState;

function getCooldownMs() {
  const configuredSeconds = Number(
    process.env.SECURITY_ALERT_COOLDOWN_SECONDS
  );

  if (Number.isFinite(configuredSeconds) && configuredSeconds >= 0) {
    return configuredSeconds * 1000;
  }

  return DEFAULT_COOLDOWN_SECONDS * 1000;
}

function canSendSecurityAlert() {
  const cooldownMs = getCooldownMs();
  const lastAlertAt = globalSecurityAlertState.lastSecurityAlertAt || 0;

  return Date.now() - lastAlertAt >= cooldownMs;
}

function markSecurityAlertSent() {
  globalSecurityAlertState.lastSecurityAlertAt = Date.now();
}

function formatAlertBody(event: SecurityEventMetadata) {
  return [
    "An unauthorized attempt to access the embedded application was detected.",
    "",
    `Path: ${event.path}`,
    `Origin: ${event.detectedOrigin || "Unavailable"}`,
    `Referer: ${event.referer || "Unavailable"}`,
    `IP: ${event.ip || "Unavailable"}`,
    `User-Agent: ${event.userAgent || "Unavailable"}`,
    `Timestamp: ${event.timestamp}`,
    `Reason: ${event.reason}`,
  ].join("\n");
}

export async function sendSecurityAlert(event: SecurityEventMetadata) {
  if (!canSendSecurityAlert()) {
    console.warn(
      "Security alert suppressed by cooldown.",
      JSON.stringify({
        path: event.path,
        detectedOrigin: event.detectedOrigin,
        refererOrigin: event.refererOrigin,
        timestamp: event.timestamp,
      })
    );
    return;
  }

  const webhookUrl = process.env.SECURITY_ALERT_WEBHOOK_URL;
  const recipient = process.env.SECURITY_ALERT_EMAIL;
  const subject = "Unauthorized iframe access attempt detected";
  const body = formatAlertBody(event);

  try {
    if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          recipient,
          body,
          event,
        }),
      });

      if (!response.ok) {
        throw new Error(`Security alert webhook failed: ${response.status}`);
      }
    } else {
      console.warn(
        "Security alert notification channel is not configured.",
        JSON.stringify({
          recipient: recipient || "Unavailable",
          subject,
          body,
        })
      );
    }

    markSecurityAlertSent();
  } catch (error) {
    console.error("Failed to send security alert notification:", error);
  }
}

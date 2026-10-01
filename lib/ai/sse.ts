export function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export type ParsedSseEvent = {
  event: string;
  data: unknown;
};

export function parseSseBuffer(buffer: string) {
  const events: ParsedSseEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";

  for (const part of parts) {
    let event = "message";
    const dataLines: string[] = [];

    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }

    if (!dataLines.length) continue;
    const raw = dataLines.join("\n");
    try {
      events.push({ event, data: JSON.parse(raw) });
    } catch {
      events.push({ event, data: raw });
    }
  }

  return { events, rest };
}

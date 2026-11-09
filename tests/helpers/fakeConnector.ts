import { connectorWithTest, type Connector, type GenerateRequest } from "../../src/core/connectors/types";

export interface FakeConnector extends Connector {
  requests: GenerateRequest[];
}

/** Replies in order. A reply that is an Error is thrown. The last reply repeats. */
export function fakeConnector(replies: (string | Error)[]): FakeConnector {
  const requests: GenerateRequest[] = [];
  const base = connectorWithTest("fake", true, async (request) => {
    requests.push(request);
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (reply instanceof Error) {
      throw reply;
    }
    return reply ?? "";
  });
  return { ...base, requests };
}

export const noSignal = new AbortController().signal;

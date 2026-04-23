import { errorMessage } from "./db";
import { fanoutSessionStarted, fanoutSessionStopped } from "./notifications";
import type { PresenceQueueMessage } from "./types";

export async function handlePresenceQueueMessage(
  env: Env,
  msg: Message<PresenceQueueMessage>,
): Promise<void> {
  try {
    if (msg.body.kind === "session_started") {
      await fanoutSessionStarted(env.JAMFUL_D1, msg.body);
    } else if (msg.body.kind === "session_stopped") {
      await fanoutSessionStopped(env.JAMFUL_D1, msg.body);
    }
    msg.ack();
  } catch (error) {
    console.error("[jamful] presence queue error", errorMessage(error));
    msg.retry();
  }
}

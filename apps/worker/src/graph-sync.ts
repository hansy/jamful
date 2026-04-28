import type { GraphSyncQueueMessage } from "./types";

/**
 * X followings sync was intentionally removed.
 *
 * Keep this handler as an explicit no-op so old queued graph-sync messages are
 * acknowledged without refreshing X tokens or calling paid X followings reads.
 */
export async function handleGraphSyncMessage(
  _env: Env,
  msg: Message<GraphSyncQueueMessage>,
): Promise<void> {
  msg.ack();
}

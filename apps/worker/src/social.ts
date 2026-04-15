/** Replace following list and update inverse follower indexes in KV. */
export async function setFollowingGraph(
  kv: KVNamespace,
  userId: string,
  nextFollowing: string[],
): Promise<void> {
  const prevRaw = await kv.get(`following:${userId}`);
  const prev: string[] = prevRaw ? (JSON.parse(prevRaw) as string[]) : [];

  for (const u of prev) {
    if (!nextFollowing.includes(u)) {
      const key = `followers:${u}`;
      const curRaw = await kv.get(key);
      const cur: string[] = curRaw ? (JSON.parse(curRaw) as string[]) : [];
      const filtered = cur.filter((x) => x !== userId);
      await kv.put(key, JSON.stringify(filtered));
    }
  }

  await kv.put(`following:${userId}`, JSON.stringify(nextFollowing));

  for (const u of nextFollowing) {
    const key = `followers:${u}`;
    const curRaw = await kv.get(key);
    const cur: string[] = curRaw ? (JSON.parse(curRaw) as string[]) : [];
    if (!cur.includes(userId)) {
      cur.push(userId);
      await kv.put(key, JSON.stringify(cur));
    }
  }
}

export async function getFollowers(kv: KVNamespace, userId: string): Promise<string[]> {
  const raw = await kv.get(`followers:${userId}`);
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}

export async function getFollowing(kv: KVNamespace, userId: string): Promise<string[]> {
  const raw = await kv.get(`following:${userId}`);
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}

export type Profile = { name: string; avatar_url: string };

export async function getProfile(kv: KVNamespace, userId: string): Promise<Profile | null> {
  const raw = await kv.get(`profile:${userId}`);
  if (!raw) return null;
  return JSON.parse(raw) as Profile;
}

export async function putProfile(kv: KVNamespace, userId: string, p: Profile): Promise<void> {
  await kv.put(`profile:${userId}`, JSON.stringify(p));
}

import DigestClient from "./digest-client";
import { getDigest, type Digest } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  let initial: Digest;
  try {
    initial = await getDigest();
  } catch {
    initial = { cards: [], fetched_at: new Date().toISOString(), last_run_at: null };
  }
  return <DigestClient initial={initial} />;
}

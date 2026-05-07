import type { FullConfig } from '@playwright/test';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  // Steam is intentionally left running after tests complete.
  // To quit Steam manually: SteamClient.User.StartShutdown(false)
  console.log('[teardown] Tests complete. Steam is left running.');
}

import { startDiscovery } from "./target";
import { startServer } from "./server";

startServer();

// Temporary for testing
if (process.argv.includes('--app')) {
  startDiscovery(true);
} else {
  startDiscovery();
}

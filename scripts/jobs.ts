// Runs one scheduler tick from the command line: `pnpm jobs`
import { runJobs } from "../src/lib/jobs";

runJobs(10 * 60_000)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

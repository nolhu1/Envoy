import { Worker } from "bullmq"

const worker = new Worker(
  "envoy-jobs",
  async job => {
    console.log("Processing job", job.name)
  },
  { connection: { host: "localhost", port: 6379 } }
)
import safeEnvGet from "@server/safeEnvGet";

import { SpanKind, trace } from "@opentelemetry/api";
import { NodeSSH } from "node-ssh";

import { withSpan } from "../instrumentation/withSpan";

const tracer = trace.getTracer("shared");

export async function runSshCommand(
  command: string,
  attributes: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string }> {
  return withSpan(
    tracer,
    "ssh.exec",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "server.address": process.env.SSH_DEFAULT_HOST ?? "",
        ...attributes,
      },
    },
    async (span) => {
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: safeEnvGet("SSH_DEFAULT_HOST"),
          port: Number(process.env.SSH_DEFAULT_PORT ?? "22"),
          username: safeEnvGet("SSH_DEFAULT_USERNAME"),
          privateKey: safeEnvGet("SSH_DEFAULT_PRIVATE_KEY"),
        });
        const result = await ssh.execCommand(command);
        span.setAttribute("ssh.command", command);
        span.setAttribute("ssh.stdout", result.stdout);
        span.setAttribute("ssh.stderr", result.stderr);
        span.setAttribute("process.exit.code", result.code ?? -1);
        if (result.code !== 0) {
          throw new Error(
            `SSH command exited with code ${result.code}: ${result.stderr}`,
          );
        }
        return { stdout: result.stdout, stderr: result.stderr };
      } finally {
        ssh.dispose();
      }
    },
  );
}

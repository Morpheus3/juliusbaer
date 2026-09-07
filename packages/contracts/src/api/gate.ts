import { z } from 'zod';

export const GateCheck = z.object({
  name: z.string(),
  status: z.enum(['pass', 'warn', 'block']),
  detail: z.string(),
});
export type GateCheck = z.infer<typeof GateCheck>;

/** The communication gateway's verdict on one outgoing message. Every send, human or agent, passes here. */
export const GateResult = z.object({
  allowed: z.boolean(),
  checks: z.array(GateCheck),
  disclosures: z.array(z.string()),
  /** The body with required disclosures appended when missing. */
  body: z.string(),
  origin: z.enum(['rm', 'agent']),
});
export type GateResult = z.infer<typeof GateResult>;

import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_CIRCLE_APP_ID: z.string().min(1),
  CIRCLE_API_KEY: z.string().min(1),
  CIRCLE_WALLET_ID: z.string().min(1),
  AGENT_TREASURY_ADDRESS: z.string().min(1),
  RAW_ENTITY_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GENLAYER_NETWORK: z.string().min(1),
  GENLAYER_RELAYER_PRIVATE_KEY: z.string().min(1),
  GENLAYER_CONTRACT_ADDRESS: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  RECEIPT_SIGNING_SECRET: z.string().min(32),
});

export const validateEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    return {
      isValid: false,
      errors: result.error.issues.map((e: z.ZodIssue) => e.path.join('.')),
    };
  }
  return { isValid: true, errors: [] };
};

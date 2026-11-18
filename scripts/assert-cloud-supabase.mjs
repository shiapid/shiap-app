import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);

const expectedUrl = "https://sbomjhwmjmqteybsegdl.supabase.co";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

if (url !== expectedUrl || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  console.error(
    "Cloud development requires the Shiap App URL and its publishable key in .env.development.local.",
  );
  process.exit(1);
}

console.log("Supabase development target verified: Shiap App.");

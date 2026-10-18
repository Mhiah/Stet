import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { VerifyForm } from "@/components/verify-form";

export const metadata: Metadata = { title: "Verify a brief · Stet" };

export default async function VerifyPage(props: PageProps<"/verify">) {
  const run = (await props.searchParams).run;
  return (
    <>
      <SiteHeader />
      <VerifyForm initialRun={typeof run === "string" ? run : ""} />
    </>
  );
}

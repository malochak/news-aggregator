import { redirect } from "next/navigation";
import { githubEnabled, signupAllowed } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-16">
      <p className="meta mb-3">Feedlist</p>
      <h1 className="mb-2 font-serif text-5xl leading-[1.05] tracking-tight">
        Everything you follow, <em className="text-accent">as a checklist.</em>
      </h1>
      <p className="mb-10 text-graphite">
        Blogs, channels and feeds arrive as to-dos with a short summary. Read it, tick it off.
      </p>
      <SignInForm signupAllowed={signupAllowed} githubEnabled={githubEnabled} />
    </main>
  );
}

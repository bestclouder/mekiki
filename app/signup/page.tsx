import AuthForm from "@/app/auth/auth-form";

export const metadata = { title: "Sign up — Mekiki" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}

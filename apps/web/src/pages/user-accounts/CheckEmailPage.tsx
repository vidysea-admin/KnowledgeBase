/** apps/web/src/pages/user-accounts/CheckEmailPage.tsx -- unit ua-web, UA-4. v1 sends no mail: the admin hands over the verification link. */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AuthCard } from "./LoginPage.js";

export function CheckEmailPage(): ReactNode {
  return (
    <AuthCard title="Account requested" intro="This server does not send email yet.">
      <p>An admin will give you a verification link. Open it, confirm your email, and then wait for approval.</p>
      <p>If you already have an account, nothing changed; sign in as usual.</p>
      <p className="auth-links"><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}

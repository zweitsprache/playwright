import Link from "next/link";

import { hasAdminCredentials, sanitizeNextPath } from "@/lib/auth";

import styles from "./page.module.css";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  config: "Login is not configured on the server yet.",
  invalid: "The email or password is incorrect.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? ERROR_MESSAGES[params.error] : null;
  const nextPath = sanitizeNextPath(params.next);
  const isConfigured = hasAdminCredentials();

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div>
          <p className={styles.eyebrow}>Protected App</p>
          <h1 className={styles.title}>Sign in</h1>
        </div>
        <p className={styles.copy}>
          Use the admin credentials from the server environment to access the launcher and editor.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {!isConfigured ? (
          <p className={styles.error}>
            Missing <code>ADMIN_USER_EMAIL</code> or <code>ADMIN_USER_PW</code> in the server environment.
          </p>
        ) : null}
        <form action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={nextPath} />
          <label className={styles.field} htmlFor="email">
            <span className={styles.label}>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              className={styles.input}
              required
            />
          </label>
          <label className={styles.field} htmlFor="password">
            <span className={styles.label}>Password</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={styles.input}
              required
            />
          </label>
          <button className={styles.submit} type="submit" disabled={!isConfigured}>
            Sign in
          </button>
        </form>
        <p className={styles.note}>
          Need to leave the protected area later? Visit <Link href="/api/auth/logout">/api/auth/logout</Link>.
        </p>
      </main>
    </div>
  );
}
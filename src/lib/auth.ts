import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail, getUserById } from "@/server/data/users";
import { checkRateLimit } from "@/server/data/rate-limit";
import { loginSchema } from "@/lib/validations/auth";

// A custom `code` (not the free-form message) is Auth.js's documented way to safely surface a
// specific reason through the client-visible URL/response — see @auth/core's CredentialsSignin
// doc comment. The password was already verified before this is thrown (see authorize() below),
// so revealing "suspended" here doesn't create an account-enumeration risk.
class AccountSuspendedError extends CredentialsSignin {
  code = "account_suspended";
}

// Keyed by email, not IP — preserves the dummy-hash timing trick below (an unknown email and a
// wrong password must look identical to a client either way), and a per-account lockout is
// exactly what "lock out or back off on repeated failed logins" (CLAUDE.md) asks for.
class TooManyAttemptsError extends CredentialsSignin {
  code = "too_many_attempts";
}

// A fixed dummy hash to compare against when no user is found, so a nonexistent email doesn't
// resolve faster than a wrong password would — see security.md > Authentication. Computed once
// per process (not hardcoded) so it's guaranteed to be a structurally valid bcrypt hash.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-safety", 12);

const BUYER_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STAFF_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours — seller/admin, higher-value access

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js auto-trusts the host on Vercel (it detects process.env.VERCEL) but not on a plain
  // `next start` behind another reverse proxy/self-hosted setup — without this, production
  // rejects every request with UntrustedHost. Safe here since we're not blindly trusting an
  // arbitrary forwarded host from the public Internet at this stage (no proxy in front yet);
  // revisit if/when a reverse proxy is introduced outside Vercel.
  trustHost: true,
  // Auth.js's Credentials provider never creates a database session — confirmed against
  // @auth/core's actual callback code (it always issues a JWT for `provider.type ===
  // "credentials"`, regardless of `session.strategy`). JWT strategy is therefore the only
  // option here, not a preference. Server-side revocation (security.md's requirement) is
  // reimplemented on top of it below via `sessionVersion` + a DB check on every request, since
  // there's no adapter-backed session row to delete on logout/suspension/role change.
  session: {
    strategy: "jwt",
    // 30d is the buyer ceiling — the outer envelope for the JWT/cookie itself. The actual
    // per-role ceiling (12h for seller/admin) is enforced inside the jwt callback below using
    // our own `loginAt` timestamp, since Auth.js only supports one global maxAge.
    maxAge: BUYER_SESSION_MS / 1000,
  },
  pages: {
    signIn: "/auth/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const rateLimit = await checkRateLimit(`login:${email}`, { limit: 5, windowSeconds: 900 });
        if (!rateLimit.allowed) {
          throw new TooManyAttemptsError();
        }

        const user = await getUserByEmail(email);

        if (!user) {
          // Run the compare anyway against a fixed dummy hash so this path takes roughly the
          // same time as a real mismatch — avoids a timing side-channel that would otherwise
          // let an attacker distinguish "no such email" from "wrong password" by response time.
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        if (user.status === "suspended") {
          // The password was already verified above, so this user legitimately owns the
          // account and is entitled to know why login is blocked — this does not violate the
          // no-enumeration rule, which only protects unauthenticated guesses.
          throw new AccountSuspendedError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          emailVerifiedAt: user.emailVerifiedAt,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh sign-in: stamp the token with what authorize() returned and record when this
        // session actually started — `loginAt` is ours, untouched by Auth.js's own re-encoding
        // on every request (which would otherwise reset a native `iat` claim each time).
        // authorize() below always sets a real id from the User row; the base type just allows
        // undefined for providers that don't (e.g. some OAuth flows before account linking).
        token.id = user.id!;
        token.role = user.role;
        token.status = user.status;
        token.emailVerifiedAt = user.emailVerifiedAt
          ? user.emailVerifiedAt.toISOString()
          : null;
        token.sessionVersion = user.sessionVersion;
        token.loginAt = Date.now();
        return token;
      }

      // Every subsequent request re-validates against the DB — this is what makes suspension,
      // a role/privilege change (which must bump sessionVersion — see data-model.md's User
      // entity), or an explicit "log out everywhere" take effect immediately instead of waiting
      // out the token's natural expiry. Returning null here clears the session cookie
      // (see @auth/core's session action).
      const dbUser = await getUserById(token.id);
      if (!dbUser || dbUser.status === "suspended" || dbUser.sessionVersion !== token.sessionVersion) {
        return null;
      }

      const ceilingMs = dbUser.role === "buyer" ? BUYER_SESSION_MS : STAFF_SESSION_MS;
      if (Date.now() - token.loginAt > ceilingMs) {
        return null;
      }

      // Email verification is a UX gate, not a privilege — safe to refresh live so verifying in
      // another tab takes effect without forcing a fresh login.
      token.emailVerifiedAt = dbUser.emailVerifiedAt ? dbUser.emailVerifiedAt.toISOString() : null;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.status = token.status;
      session.user.emailVerifiedAt = token.emailVerifiedAt ? new Date(token.emailVerifiedAt) : null;
      return session;
    },
  },
});

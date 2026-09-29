import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getUserByEmail, getUserById, createUser } from "@/server/data/users";
import { checkRateLimit, peekRateLimitCount } from "@/server/data/rate-limit";
import { loginSchema } from "@/lib/validations/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";

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

// Thrown when a CAPTCHA is required for this attempt (see CAPTCHA_ATTEMPT_THRESHOLD below) and
// either wasn't completed or failed verification. Distinct from TooManyAttemptsError — this can
// fire well before the hard lockout, to slow down credential-stuffing without locking the
// account out entirely.
class CaptchaRequiredError extends CredentialsSignin {
  code = "captcha_required";
}

// After this many attempts already recorded in the current window (see the shared `login:*`
// bucket below — the same one checkRateLimit enforces the hard 5-attempt lockout against), every
// further attempt in that window must pass a Turnstile check before a password compare even
// happens. Chosen below the hard limit (5) so a scripted attacker can't get free password
// guesses by simply never supplying a token — those attempts still count toward both this
// threshold and the eventual lockout.
const CAPTCHA_ATTEMPT_THRESHOLD = 2;

// A fixed dummy hash to compare against when no user is found, so a nonexistent email doesn't
// resolve faster than a wrong password would — see security.md > Authentication. Computed once
// per process (not hardcoded) so it's guaranteed to be a structurally valid bcrypt hash.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-safety", 12);

const BUYER_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STAFF_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours — seller/admin, higher-value access

// Computed once at module load — read by Server Components (login/register pages) to decide
// whether to render the "Continue with Google" button at all. Kept in sync with the identical
// check gating the provider's registration below, so the button never appears when the provider
// wouldn't actually be there to handle it.
export const googleOAuthEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

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

        // Peeked before checkRateLimit's own increment below, so this reflects attempts already
        // recorded *before* the current one — the current attempt is what decides whether a
        // CAPTCHA is required, not whether it counts toward its own threshold.
        const priorAttempts = await peekRateLimitCount(`login:${email}`);
        if (priorAttempts >= CAPTCHA_ATTEMPT_THRESHOLD) {
          const turnstileToken = (credentials as { turnstileToken?: string }).turnstileToken;
          const captchaOk = await verifyTurnstileToken(turnstileToken);
          if (!captchaOk) {
            throw new CaptchaRequiredError();
          }
        }

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

        if (!user.passwordHash) {
          // OAuth-only account (created via Google, see the provider below) — nothing to compare
          // against. Same dummy-hash timing trick as the no-such-user branch above, and the same
          // generic null return, so this is indistinguishable from a wrong password to the
          // client (no enumeration of which accounts are OAuth-only).
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
    // Only registered when configured — an empty clientId/clientSecret would otherwise make
    // Auth.js throw at startup. `googleOAuthEnabled` above gates the "Continue with Google"
    // button the same way, so it never renders when this provider isn't actually here to
    // handle it.
    ...(googleOAuthEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            // Overriding the default profile() mapping to return our own internal User shape
            // directly (id/role/status/sessionVersion — see next-auth.d.ts's augmented User
            // type) rather than Google's raw {sub, name, email, picture}. This is what makes a
            // Google sign-in and a Credentials sign-in for the same email resolve to the exact
            // same account with no separate Account/linking table: the lookup-or-create happens
            // right here, so by the time the jwt callback below runs, `user` already looks
            // identical regardless of which provider produced it.
            async profile(profile) {
              if (!profile.email_verified) {
                // Google didn't confirm ownership of this address — never trust it enough to
                // link or create an account from it.
                throw new Error("Google account email is not verified.");
              }
              const email = profile.email.toLowerCase();

              let user = await getUserByEmail(email);
              if (!user) {
                user = await createUser({
                  email,
                  name: profile.name ?? email,
                  emailVerifiedAt: new Date(),
                });
              }

              if (user.status === "suspended") {
                throw new Error("Your account has been suspended. Contact support.");
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
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account && account.provider !== "credentials") {
        // Auth.js overwrites `user.id` with a random UUID for OAuth sign-ins (see
        // getUserAndAccount in @auth/core), so the id/role/sessionVersion returned by the
        // provider's profile() can't be trusted here. Re-resolve the real row by email — profile()
        // already created/linked it and rejected unverified or suspended accounts.
        const dbUser = user.email ? await getUserByEmail(user.email) : null;
        if (!dbUser || dbUser.status === "suspended") return null;
        token.id = dbUser.id;
        token.role = dbUser.role;
        token.status = dbUser.status;
        token.emailVerifiedAt = dbUser.emailVerifiedAt ? dbUser.emailVerifiedAt.toISOString() : null;
        token.sessionVersion = dbUser.sessionVersion;
        token.loginAt = Date.now();
        return token;
      }

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

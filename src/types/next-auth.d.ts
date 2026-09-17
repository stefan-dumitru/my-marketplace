import type { DefaultSession } from "next-auth";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      status: UserStatus;
      emailVerifiedAt: Date | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    sessionVersion: number;
  }
}

// Augmenting "next-auth/jwt" doesn't merge here — that module only re-exports (`export * from
// "@auth/core/jwt"`), it doesn't locally declare JWT, so TS declaration merging needs the
// module that actually does.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    status: UserStatus;
    emailVerifiedAt: string | null;
    sessionVersion: number;
    /** Ms timestamp of original sign-in — ours, not a standard JWT claim (see src/lib/auth.ts). */
    loginAt: number;
  }
}

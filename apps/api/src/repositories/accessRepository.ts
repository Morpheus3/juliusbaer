import { rms, userRoles, users, type Db } from '@jb/db';
import { eq } from 'drizzle-orm';

export interface UserRecord {
  userId: string;
  subject: string;
  displayName: string;
  email: string | null;
  rmId: string | null;
  teamId: string | null;
  roles: string[];
  status: string;
}

/** Identities and roles. These tables carry no client data and no row-level security. */
export class AccessRepository {
  constructor(private readonly db: Db) {}

  async bySubject(subject: string): Promise<UserRecord | null> {
    const [u] = await this.db
      .select({
        userId: users.userId,
        subject: users.subject,
        displayName: users.displayName,
        email: users.email,
        rmId: users.rmId,
        status: users.status,
        teamId: rms.teamId,
      })
      .from(users)
      .leftJoin(rms, eq(rms.rmId, users.rmId))
      .where(eq(users.subject, subject));
    if (!u) {
      return null;
    }
    const roles = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, u.userId));
    return { ...u, roles: roles.map((r) => r.role) };
  }

  /** Development identity list: who can be impersonated at the dev login. */
  async listUsers(): Promise<UserRecord[]> {
    const rows = await this.db
      .select({
        userId: users.userId,
        subject: users.subject,
        displayName: users.displayName,
        email: users.email,
        rmId: users.rmId,
        status: users.status,
        teamId: rms.teamId,
      })
      .from(users)
      .leftJoin(rms, eq(rms.rmId, users.rmId));
    const allRoles = await this.db.select().from(userRoles);
    return rows.map((u) => ({
      ...u,
      roles: allRoles.filter((r) => r.userId === u.userId).map((r) => r.role),
    }));
  }

  /** The checker for an RM's client: a checker in the same team, else the team head. */
  async checkerFor(teamId: string | null, excludingRmId: string | null): Promise<string | null> {
    if (!teamId) {
      return null;
    }
    const rows = await this.db
      .select({ rmId: users.rmId, role: userRoles.role })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.userId))
      .innerJoin(rms, eq(rms.rmId, users.rmId))
      .where(eq(rms.teamId, teamId));
    const checker = rows.find((r) => r.role === 'checker' && r.rmId && r.rmId !== excludingRmId);
    const head = rows.find((r) => r.role === 'team_head' && r.rmId && r.rmId !== excludingRmId);
    return checker?.rmId ?? head?.rmId ?? null;
  }
}

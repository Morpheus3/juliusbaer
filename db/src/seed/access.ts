/**
 * Backfills the RM model and development identities from the dataset: one team per desk, one RM per
 * rm_id found on clients, a primary assignment per client from client_since, and a user per RM.
 * Extra users (heads, checkers, admins) come from reference/access.json. Idempotent.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../client.js';
import * as s from '../schema/index.js';
import type { Dataset } from './dataset.js';

const AccessFile = z.object({
  version: z.number().int().positive(),
  users: z.array(
    z.object({
      subject: z.string().min(1),
      displayName: z.string().min(1),
      email: z.string().optional(),
      roles: z.array(z.enum(['rm', 'team_head', 'checker', 'admin'])).min(1),
      rmId: z.string().optional(),
      teamId: z.string().optional(),
      /** "first": the first team found in the data. */
      team: z.enum(['first']).optional(),
    }),
  ),
});

export const teamIdFor = (desk: string): string =>
  `TEAM-${
    desk
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'default'
  }`;

export async function loadAccess(
  db: Db,
  data: Dataset,
  referenceDir: string,
): Promise<{ teams: number; rms: number; assignments: number; users: number }> {
  const desks = [...new Set(data.clients.map((c) => c.rm_desk))];
  const teams = desks.map((d) => ({ teamId: teamIdFor(d), name: d, desk: d }));
  const rmMap = new Map<string, { rmId: string; name: string; desk: string; teamId: string }>();
  for (const c of data.clients) {
    rmMap.set(c.rm_id, {
      rmId: c.rm_id,
      name: c.rm_name,
      desk: c.rm_desk,
      teamId: teamIdFor(c.rm_desk),
    });
  }
  const rms = [...rmMap.values()];
  const assignments = data.clients.map((c) => ({
    clientId: c.client_id,
    rmId: c.rm_id,
    role: 'primary',
    validFrom: c.client_since,
    source: 'dataset',
    reason: 'primary RM on the client record',
  }));
  let text: string | null = null;
  try {
    text = await readFile(path.join(referenceDir, 'access.json'), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
  const extra = text ? AccessFile.parse(JSON.parse(text)).users : [];

  return db.transaction(async (tx) => {
    if (teams.length) {
      await tx
        .insert(s.teams)
        .values(teams)
        .onConflictDoUpdate({
          target: s.teams.teamId,
          set: { name: sql`excluded.name`, desk: sql`excluded.desk` },
        });
    }
    if (rms.length) {
      await tx
        .insert(s.rms)
        .values(rms)
        .onConflictDoUpdate({
          target: s.rms.rmId,
          set: {
            name: sql`excluded.name`,
            desk: sql`excluded.desk`,
            teamId: sql`excluded.team_id`,
          },
        });
    }
    // Dataset assignments: close any dataset-sourced primary that no longer matches, insert the rest.
    await tx.execute(sql`
      UPDATE raw.rm_assignments a SET valid_to = current_date
      WHERE a.source = 'dataset' AND a.role = 'primary' AND a.valid_to IS NULL
        AND NOT EXISTS (SELECT 1 FROM raw.clients c WHERE c.client_id = a.client_id AND c.rm_id = a.rm_id)
    `);
    let inserted = 0;
    for (const a of assignments) {
      const r = await tx.execute(sql`
        INSERT INTO raw.rm_assignments (client_id, rm_id, role, valid_from, source, reason)
        SELECT ${a.clientId}, ${a.rmId}, ${a.role}, ${a.validFrom}::date, ${a.source}, ${a.reason}
        WHERE NOT EXISTS (
          SELECT 1 FROM raw.rm_assignments x
          WHERE x.client_id = ${a.clientId} AND x.rm_id = ${a.rmId} AND x.role = 'primary' AND x.valid_to IS NULL)
      `);
      inserted += r.rowCount ?? 0;
    }
    // One user per RM, role rm.
    let users = 0;
    for (const rm of rms) {
      await tx
        .insert(s.users)
        .values({ subject: rm.rmId, displayName: rm.name, rmId: rm.rmId })
        .onConflictDoUpdate({
          target: s.users.subject,
          set: { displayName: rm.name, rmId: rm.rmId },
        });
      await tx.execute(sql`
        INSERT INTO access.user_roles (user_id, role)
        SELECT u.user_id, 'rm' FROM access.users u WHERE u.subject = ${rm.rmId}
        ON CONFLICT DO NOTHING`);
      users += 1;
    }
    const firstTeam = teams[0]?.teamId ?? null;
    for (const u of extra) {
      const teamId = u.teamId ?? (u.team === 'first' ? firstTeam : null);
      let rmId: string | null = u.rmId ?? null;
      if (u.roles.includes('team_head') && teamId) {
        // A head is modelled as an RM row too, so team scope and audit actors resolve the same way.
        rmId = rmId ?? `RM-${u.subject.toUpperCase()}`;
        await tx
          .insert(s.rms)
          .values({
            rmId,
            name: u.displayName,
            desk: teams.find((t) => t.teamId === teamId)?.desk ?? '',
            teamId,
          })
          .onConflictDoUpdate({ target: s.rms.rmId, set: { name: u.displayName, teamId } });
        await tx
          .update(s.teams)
          .set({ headRmId: rmId })
          .where(sql`${s.teams.teamId} = ${teamId}`);
      }
      if (u.roles.includes('checker') && teamId && !rmId) {
        rmId = `RM-${u.subject.toUpperCase()}`;
        await tx
          .insert(s.rms)
          .values({
            rmId,
            name: u.displayName,
            desk: teams.find((t) => t.teamId === teamId)?.desk ?? '',
            teamId,
          })
          .onConflictDoUpdate({ target: s.rms.rmId, set: { name: u.displayName, teamId } });
      }
      await tx
        .insert(s.users)
        .values({ subject: u.subject, displayName: u.displayName, email: u.email ?? null, rmId })
        .onConflictDoUpdate({ target: s.users.subject, set: { displayName: u.displayName, rmId } });
      for (const role of u.roles) {
        await tx.execute(sql`
          INSERT INTO access.user_roles (user_id, role)
          SELECT u.user_id, ${role} FROM access.users u WHERE u.subject = ${u.subject}
          ON CONFLICT DO NOTHING`);
      }
      users += 1;
    }
    return { teams: teams.length, rms: rms.length, assignments: inserted, users };
  });
}

import Run from '../entities/Run.js';
import Reward from '../entities/Reward.js';
import Notification from '../entities/Notification.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { pointsFor } from './RunRewards.js';

export default class AdminDeleteRunController {
  async deleteRun({ adminId, runId, reason }) {
    return guard(() =>
      withTransaction(async (client) => {
        const run = await Run.findById(runId, client);
        if (!run) throw AdminError.notFound('Run not found');

        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.DELETE_RUN,
            targetUserId: run.userId,
            targetType: 'run',
            targetId: runId,
            details: {
              name: run.name,
              distanceKm: run.distanceKm,
              durationSeconds: run.durationSeconds,
              startedAt: run.startedAt,
              reason,
            },
          },
          client
        );

        // Removing a faked run has to remove what it paid out, or the points survive the
        // run that earned them. Floors at zero if they have already been spent.
        const pointsReclaimed = await Reward.reclaimPoints(
          run.userId,
          pointsFor(run.distanceKm),
          client
        );

        await Run.delete(runId, client);

        await Notification.create(
          run.userId,
          {
            type: 'run_removed',
            title: 'A run was removed',
            body: `Your run${run.name ? ` "${run.name}"` : ''} was removed by an administrator.${
              reason ? ` Reason: ${reason}` : ''
            }`,
          },
          client
        );

        return { pointsReclaimed };
      })
    );
  }
}

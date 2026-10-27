import AdminSetInstructorVerificationController from '../control/AdminSetInstructorVerificationController.js';
import { getAdminId, parseId, readReason, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminSetInstructorVerificationController();

// PATCH /api/admin/users/:userId/instructor-verification   body: { verified: boolean, reason?: string }
export default async function adminSetInstructorVerificationBoundary(req, res) {
  try {
    const verified = req.body?.verified;
    const user = await controller.setVerification({
      adminId: getAdminId(req),
      userId: parseId(req.params.userId, 'userId'),
      verified,
      reason: readReason(req.body),
    });
    return res.json({
      message: verified ? 'Instructor verified' : 'Instructor verification removed',
      user,
    });
  } catch (err) {
    return sendError(res, err, 'set instructor verification');
  }
}

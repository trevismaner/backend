import User from '../entities/User.js';

/**
 * IU-04: submit qualification details for admin review (SA-11).
 * Resubmitting sends the account back to "pending", because the details changed.
 */
async function submitInstructorCredentialsController({ qualification, reference } = {}) {
  if (!qualification || !qualification.trim()) {
    return { success: false, field: 'qualification', message: 'Enter your qualification or certification.' };
  }
  if (qualification.trim().length > 200) {
    return { success: false, field: 'qualification', message: 'Qualification must be 200 characters or fewer.' };
  }
  if (reference && reference.trim().length > 200) {
    return { success: false, field: 'reference', message: 'Reference must be 200 characters or fewer.' };
  }

  try {
    const data = await User.submitCredentials({
      qualification: qualification.trim(),
      reference: reference?.trim() || null,
    });
    return { success: true, field: null, message: data.message, data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default submitInstructorCredentialsController;

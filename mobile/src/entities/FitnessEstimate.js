import request from '../api/client.js';

/**
 * The fitness estimate and the runner's classified level.
 *
 * One request for both, because the backend answers them together — from the runner's side
 * they are one question ("where am I?") and splitting them would only make the screen wait
 * twice. See backend/control/ViewFitnessEstimateController.js.
 */
class FitnessEstimate {
  static async get() {
    return request('/fitness-estimate');
  }
}

export default FitnessEstimate;

import request from '../api/client.js';

export const CHRONIC_CONDITIONS = ['asthma', 'hypertension', 'diabetes', 'knee_arthritis'];

export const CONDITION_LABELS = {
  asthma: 'Asthma',
  hypertension: 'High blood pressure',
  diabetes: 'Diabetes',
  knee_arthritis: 'Knee arthritis',
};

class RiskAssessment {
  static async get() {
    return request('/risk-assessment');
  }

  static async updateForm({ isCurrentlySick, chronicConditions, pastInjuries, selfRatedSoreness }) {
    return request('/risk-assessment/form', {
      method: 'PUT',
      body: { isCurrentlySick, chronicConditions, pastInjuries, selfRatedSoreness },
    });
  }
}

export default RiskAssessment;

exports.handler = async (event) => {
  // Keep users unconfirmed; manual approval required in V1
  event.response.autoConfirmUser = false;
  event.response.autoVerifyPhone = true; // phone should be verified by OTP later
  return event;
};

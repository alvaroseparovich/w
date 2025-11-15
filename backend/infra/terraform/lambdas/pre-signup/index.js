exports.handler = async (event) => {
  // Keep users unconfirmed; manual approval required in V1
  event.response.autoConfirmUser = false;
  // Do NOT auto-verify phone if not auto-confirming the user; Cognito forbids this combination
  event.response.autoVerifyPhone = false;
  return event;
};

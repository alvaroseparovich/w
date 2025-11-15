exports.handler = async (event) => {
  // event.request.session: list of previous challenges
  // For CUSTOM_AUTH with OTP, always present a CUSTOM_CHALLENGE until verified
  const session = event.request.session || [];
  const challengeAttempts = session.length;

  if (session.some(s => s.challengeName === 'CUSTOM_CHALLENGE' && s.challengeResult === true)) {
    // Auth succeeded in a previous step
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else if (challengeAttempts >= 3) {
    // Too many attempts
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
  } else {
    // Continue challenge
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
  }

  return event;
};

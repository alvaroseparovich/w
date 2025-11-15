exports.handler = async (event) => {
  const expected = event.request.privateChallengeParameters?.code;
  const expiresAt = parseInt(event.request.privateChallengeParameters?.expiresAt || '0', 10);
  const provided = event.request.challengeAnswer;

  const now = Date.now();

  let success = false;
  if (expected && provided && now < expiresAt) {
    // Constant-time compare
    const a = Buffer.from(String(expected));
    const b = Buffer.from(String(provided));
    if (a.length === b.length) {
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      success = diff === 0;
    }
  }

  event.response.answerCorrect = !!success;
  return event;
};

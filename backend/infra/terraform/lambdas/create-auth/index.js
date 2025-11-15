const crypto = require('crypto');
const AWS = require('aws-sdk');
const sns = new AWS.SNS();

function generateCode() {
  return ('' + Math.floor(100000 + Math.random() * 900000));
}

exports.handler = async (event) => {
  const code = generateCode();
  const ttlMinutes = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;

  // Expose code to Verify step via privateChallengeParameters
  event.response.privateChallengeParameters = { code, expiresAt: String(expiresAt) };
  // Optionally return obfuscated info to client
  event.response.publicChallengeParameters = { delivery: 'sms' };
  event.response.challengeMetadata = `CODE-${code}`;

  const phone = event.request.userAttributes.phone_number;

  // Send SMS
  const message = `Your verification code is: ${code}`;
  await sns.publish({ Message: message, PhoneNumber: phone }).promise();

  return event;
};

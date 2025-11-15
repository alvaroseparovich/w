import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const REGION = process.env.AWS_REGION || 'us-east-1';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '4qih2ggplpt8nsotuceodnegui';
const cip = new CognitoIdentityProviderClient({ region: REGION });

app.post('/auth/initiate', async (req, res) => {
  try {
    const { phone } = req.body;
    const out = await cip.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: 'CUSTOM_AUTH',
      AuthParameters: { USERNAME: phone },
    }));
    return res.json({ session: out.Session || null, challengeName: out.ChallengeName || null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'initiate_failed' });
  }
});

app.post('/auth/respond', async (req, res) => {
  try {
    const { phone, session, code } = req.body;
    const out = await cip.send(new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: 'CUSTOM_CHALLENGE',
      Session: session,
      ChallengeResponses: { USERNAME: phone, ANSWER: code },
    }));
    const r = out.AuthenticationResult || {};
    return res.json({
      accessToken: r.AccessToken,
      idToken: r.IdToken,
      refreshToken: r.RefreshToken,
      expiresIn: r.ExpiresIn,
      tokenType: r.TokenType,
    });
  } catch (e) {
    console.error(e);
    return res.status(401).json({ error: 'respond_failed' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Auth proxy listening on :${port}`));

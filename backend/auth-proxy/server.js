import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const REGION = process.env.AWS_REGION || 'us-east-1';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '4qih2ggplpt8nsotuceodnegui';
const cip = new CognitoIdentityProviderClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const TABLE = process.env.TABLE_NAME || 'what-call-recorder-dev-tasks';

const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_zStRjxVjg';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

async function verifyToken(authHeader) {
  if (!authHeader) throw new Error('missing_auth');
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) throw new Error('bad_auth');
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, algorithms: ['RS256'] });
  return payload;
}

function userPkFromPayload(payload) {
  const phone = payload.phone_number || payload['custom:phone'] || payload.username || payload['cognito:username'];
  if (!phone) throw new Error('no_phone_in_token');
  return { phone, pk: `USER#${phone}` };
}

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

// Upload tasks (upsert with optimistic concurrency)
app.post('/sync/upload', async (req, res) => {
  try {
    const payload = await verifyToken(req.headers.authorization || '');
    const { phone, pk } = userPkFromPayload(payload);
    const items = req.body.tasks || [];
    const results = [];
    for (const t of items) {
      const now = Date.now();
      const version = typeof t.version === 'number' ? t.version : 0;
      const item = {
        pk,
        sk: `TASK#${t.id}`,
        id: t.id,
        title: t.title,
        intervals: t.intervals || [],
        archived: !!t.archived,
        tags: t.tags || [],
        updatedAt: t.updatedAt || now,
        version,
      };
      // We do a conditional put: if_exists then version must match; if not exists, allow
      try {
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: item,
          ConditionExpression: 'attribute_not_exists(pk) OR version = :v',
          ExpressionAttributeValues: { ':v': version },
        }));
        results.push({ id: t.id, ok: true });
      } catch (err) {
        results.push({ id: t.id, ok: false, conflict: true });
      }
    }
    return res.json({ results });
  } catch (e) {
    console.error(e);
    return res.status(401).json({ error: 'upload_failed' });
  }
});

// Download tasks updated since timestamp
app.get('/sync/download', async (req, res) => {
  try {
    const payload = await verifyToken(req.headers.authorization || '');
    const { pk } = userPkFromPayload(payload);
    const since = Number(req.query.since || '0');
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
    }));
    const tasks = (r.Items || []).filter(it => (it.updatedAt || 0) > since);
    return res.json({ tasks, lastEvaluatedKey: r.LastEvaluatedKey || null });
  } catch (e) {
    console.error(e);
    return res.status(401).json({ error: 'download_failed' });
  }
});

// Delete tasks by ids
app.post('/tasks/delete', async (req, res) => {
  try {
    const payload = await verifyToken(req.headers.authorization || '');
    const { pk } = userPkFromPayload(payload);
    const ids = req.body.ids || [];
    for (const id of ids) {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk: `TASK#${id}` } }));
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(401).json({ error: 'delete_failed' });
  }
});

const port = process.env.PORT || 4000;
// Only listen locally when not running inside Lambda
if (!process.env.LAMBDA_TASK_ROOT) {
  app.listen(port, () => console.log(`Auth proxy listening on :${port}`));
}

export default app;

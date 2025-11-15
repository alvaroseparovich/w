# Backend Login.

I need a easy way to login to the backend.
It should receive a phone number, and a unique id, and the ip address of the user.
It should return a token that can be used to access the backend.
This token should be valid for 12h.

## The token.
The token should be a jwt token.
It should have the following claims:
- issuer: "watchman"
- username
- phone
- id
- ip
- exp

It can use aws cognito to this.
I do not want to use password.
So there is 2 ways to login
### 1. Login with answer to a question on phone.
As a sms is sent, wthe user will receive 2 links, one for acept and one for reject.
If the user accepts, the client that requestes will receive the token to login.
If the user rejects, the token will not be sent, the request eill be rejected, and if the token where sent, it will be revoked.
### 2. Login with a code.
As a sms is sent, wthe user will receive a code.
This code should be used to login.

## Revalidation
The token should be revalidated every 12h.
The time to revalidate is 20h.
If the same session is used for 20h, it should be revalidated without any other users action.
If the session is not used for 20h, it should be revoked. and the initial processes should be repeated.

## Security
Every new user trying to register should be allowed by sms.
A SMS should be sent to the phone number +5511987792799, with a link to accept or reject the register.
If the user accepts, the user should be registered.
If the user rejects, does nothing. the user will stay pending and not be able to login.

## Deploy
The deploy should be as Code.
The deploy should use a well known tool.
The deploy should be wraped in a make file command like `make deploy`.

# V1 - Plan to Implement first Version

V1 will use AWS Cognito with Terraform. We will implement only the SMS code-based login (no approve/reject links yet), model session idle revocation via refresh token TTL, and keep the IP claim out of tokens for now.

Scope and decisions
- Use Terraform to provision all resources (Cognito, Lambda triggers, IAM, SNS config). Makefile will wrap terraform init/plan/apply.
- Passwordless login via Cognito Custom Authentication Flow using OTP (code). Approve/reject links are deferred to a later version.
- Token lifetimes: Access/ID tokens = 12h; Refresh token TTL = 20h to satisfy “revalidate at 20h; if idle for 20h, session expires.” No separate background revocation job in V1.
- Token claims: use Cognito standard JWTs (RS256). Custom claims limited to username and phone via Pre Token Generation trigger. The IP claim is omitted in V1.
- Registration approval: Defer SMS approval links. For V1, new users are created as pending and must be manually approved by an operator using a Makefile target that runs an admin script (AdminConfirmSignUp) or via the Cognito console.

Terraform resources (minimum)
- aws_cognito_user_pool with:
  - Lambda triggers: DefineAuthChallenge, CreateAuthChallenge, VerifyAuthChallenge (custom OTP flow)
  - PreSignUp trigger to mark users pending (no auto-confirm)
  - PreTokenGeneration trigger to add minimal custom claims
  - Policies to allow SMS (via SNS configuration)
- aws_cognito_user_pool_client with:
  - Allowed auth flow: CUSTOM_AUTH
  - Access token expiration: 12h; ID token expiration: 12h; Refresh token validity: 20h
- aws_iam_role and policies for each trigger Lambda with least-privilege (logs, SNS publish if needed)
- aws_lambda_function for each trigger (Node.js 20 or Python 3.12)
- Optional: aws_sns_sms_preferences (if region requires explicit config)

Flows implemented in V1
- Start login: client calls InitiateAuth (CUSTOM_AUTH) with phone and device unique id; Cognito invokes Define/Create challenge to send a one-time code via SMS.
- Verify login: client calls RespondToAuthChallenge with the code; on success, Cognito issues 12h tokens and a 20h refresh token.
- Silent revalidation: client refreshes tokens within 20h of last use; beyond that, the session naturally expires.
- Registration: user signs up; PreSignUp keeps user unconfirmed. Operator approves manually via `make approve-user PHONE=+5511...` (admin script) for V1.

Out of scope for V1 (explicitly deferred)
- Approve/reject via links and the auxiliary API to finalize challenges.
- Binding IP into tokens or enforcing IP at gateway/WAF.
- Custom app-minted JWTs or KMS-managed signing (Cognito JWKS is sufficient).

Makefile targets
- make init: terraform init
- make plan: terraform plan with workspace/env variables
- make deploy: terraform apply -auto-approve
- make destroy: terraform destroy (non-prod only)
- make approve-user PHONE=+5511987792799: run admin tool to confirm a pending user

Observability and guardrails
- CloudWatch logs/metrics for trigger Lambdas; alarms on SMS send failures and OTP verification spikes.
- Basic rate limiting via Cognito and service quotas; WAF can be added later if needed.

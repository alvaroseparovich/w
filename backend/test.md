# Test

## 1. Signup
` signup "+5511999998888"`

## 2. Aprove
`ENV=dev REGION=us-east-1 make approve-user PHONE=+5511987792799`

#### 2.2 verify
```sh
 aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_zStRjxVjg \
  --username +5511987792799 \
  --region us-east-1
```
Look for "UserStatus": "CONFIRMED". If not confirmed, the approve-user step didn’t actually run with valid AWS credentials. Make sure your AWS CLI is configured (AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN) and run the make approve-user command again.

## 3. Login
`login +5511987792799`

## 4. Challenge
`challenge 123456`

## 5. Refresh
`refresh <refresh_token>`

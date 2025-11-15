export REGION=us-east-1
export USER_POOL_ID=us-east-1_zStRjxVjg
export CLIENT_ID=4qih2ggplpt8nsotuceodnegui
export PHONE=+5511987792799
export EP="https://cognito-idp.${REGION}.amazonaws.com"


function signup() {
curl --aws-sigv4 "aws:amz:${REGION}:cognito-idp" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.SignUp" \
  -d "{\"ClientId\":\"${CLIENT_ID}\",\"Username\":\"${PHONE}\",\"Password\":\"Dummy-Password1!\",\"UserAttributes\":[{\"Name\":\"phone_number\",\"Value\":\"${PHONE}\"}]}" \
  "${EP}"
}

function confirm() {
  curl --aws-sigv4 "aws:amz:${REGION}:cognito-idp" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.AdminConfirmSignUp" \
  -d "{\"UserPoolId\":\"${USER_POOL_ID}\",\"Username\":\"${PHONE}\"}" \
  "${EP}"
}

function login() {
  SESSION=$(curl --aws-sigv4 "aws:amz:${REGION}:cognito-idp" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d "{\"AuthFlow\":\"CUSTOM_AUTH\",\"ClientId\":\"${CLIENT_ID}\",\"AuthParameters\":{\"USERNAME\":\"${PHONE}\"}}" \
  "${EP}" | jq -r .Session)
}

function challenge() {
  curl --aws-sigv4 "aws:amz:${REGION}:cognito-idp" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.RespondToAuthChallenge" \
  -d "{\"ChallengeName\":\"CUSTOM_CHALLENGE\",\"ClientId\":\"${CLIENT_ID}\",\"Session\":\"${SESSION}\",\"ChallengeResponses\":{\"USERNAME\":\"${PHONE}\",\"ANSWER\":\"123456\"}}" \
  "${EP}"
}

function refresh() {
  curl --aws-sigv4 "aws:amz:${REGION}:cognito-idp" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d "{\"AuthFlow\":\"REFRESH_TOKEN_AUTH\",\"ClientId\":\"${CLIENT_ID}\",\"AuthParameters\":{\"REFRESH_TOKEN\":\"${REFRESH_TOKEN}\"}}" \
  "${EP}"
}
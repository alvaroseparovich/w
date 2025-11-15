import os
import random
import time
import boto3

sns = boto3.client('sns')

def _generate_code():
    return str(random.randint(100000, 999999))

def lambda_handler(event, context):
    code = _generate_code()
    ttl_minutes = int(os.getenv('OTP_TTL_MINUTES', '10'))
    expires_at = int(time.time() * 1000) + ttl_minutes * 60 * 1000

    # Pass to Verify step privately
    event.setdefault('response', {})
    event['response']['privateChallengeParameters'] = {
        'code': code,
        'expiresAt': str(expires_at)
    }
    event['response']['publicChallengeParameters'] = {'delivery': 'sms'}
    event['response']['challengeMetadata'] = f"CODE-{code}"

    phone = event.get('request', {}).get('userAttributes', {}).get('phone_number')
    if phone:
        message = f"Your verification code is: {code}"
        sns.publish(PhoneNumber=phone, Message=message)

    return event

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# IAM roles for Lambda triggers
resource "aws_iam_role" "lambda_exec" {
  name               = "${local.name_prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "lambda_basic_logging" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Allow Lambda to publish SMS via SNS
resource "aws_iam_policy" "lambda_sns_publish" {
  name        = "${local.name_prefix}-lambda-sns-publish"
  description = "Allow Lambda to publish SMS via SNS"
  policy      = data.aws_iam_policy_document.lambda_sns_publish.json
}

data "aws_iam_policy_document" "lambda_sns_publish" {
  statement {
    actions   = ["sns:Publish"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy_attachment" "attach_lambda_sns_publish" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_sns_publish.arn
}

# Allow Cognito to invoke Lambda triggers
resource "aws_iam_policy" "cognito_invoke_lambda" {
  name        = "${local.name_prefix}-cognito-invoke-lambda"
  description = "Allow Cognito to invoke specific Lambdas"
  policy      = data.aws_iam_policy_document.cognito_invoke_lambda.json
}

data "aws_iam_policy_document" "cognito_invoke_lambda" {
  statement {
    actions   = ["lambda:InvokeFunction", "lambda:InvokeAsync"]
    resources = [
      aws_lambda_function.define_auth.arn,
      aws_lambda_function.create_auth.arn,
      aws_lambda_function.verify_auth.arn,
      aws_lambda_function.pre_signup.arn,
      aws_lambda_function.pre_token_gen.arn,
    ]
  }
}

resource "aws_iam_role_policy_attachment" "attach_cognito_invoke_lambda" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.cognito_invoke_lambda.arn
}

# Lambda functions (Node.js 20)
resource "aws_lambda_function" "define_auth" {
  function_name = "${local.name_prefix}-define-auth"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "${path.module}/lambdas/define-auth.zip"
  source_code_hash = filebase64sha256("${path.module}/lambdas/define-auth.zip")
  environment {
    variables = {
      OTP_TTL_MINUTES = var.otp_ttl_minutes
    }
  }
}

resource "aws_lambda_function" "create_auth" {
  function_name = "${local.name_prefix}-create-auth"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.lambda_handler"
  runtime       = "python3.12"
  filename      = "${path.module}/lambdas/create-auth.zip"
  source_code_hash = filebase64sha256("${path.module}/lambdas/create-auth.zip")
  environment {
    variables = {
      OTP_TTL_MINUTES = var.otp_ttl_minutes
    }
  }
}

resource "aws_lambda_function" "verify_auth" {
  function_name = "${local.name_prefix}-verify-auth"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "${path.module}/lambdas/verify-auth.zip"
  source_code_hash = filebase64sha256("${path.module}/lambdas/verify-auth.zip")
}

resource "aws_lambda_function" "pre_signup" {
  function_name = "${local.name_prefix}-pre-signup"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "${path.module}/lambdas/pre-signup.zip"
  source_code_hash = filebase64sha256("${path.module}/lambdas/pre-signup.zip")
}

resource "aws_lambda_function" "pre_token_gen" {
  function_name = "${local.name_prefix}-pre-token-gen"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "${path.module}/lambdas/pre-token-gen.zip"
  source_code_hash = filebase64sha256("${path.module}/lambdas/pre-token-gen.zip")
}

# Cognito User Pool and Client
resource "aws_cognito_user_pool" "pool" {
  name = "${local.name_prefix}-user-pool"

  lambda_config {
    define_auth_challenge           = aws_lambda_function.define_auth.arn
    create_auth_challenge           = aws_lambda_function.create_auth.arn
    verify_auth_challenge_response  = aws_lambda_function.verify_auth.arn
    pre_sign_up                     = aws_lambda_function.pre_signup.arn
    pre_token_generation            = aws_lambda_function.pre_token_gen.arn
  }

  schema {
    name                = "phone_number"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name         = "${local.name_prefix}-client"
  user_pool_id = aws_cognito_user_pool.pool.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_CUSTOM_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  access_token_validity  = 12
  id_token_validity      = 12
  refresh_token_validity = 20
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "hours"
  }

  callback_urls = var.redirect_signin_urls
  logout_urls   = var.redirect_signout_urls
  supported_identity_providers = ["COGNITO"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows  = ["code", "implicit"]
  allowed_oauth_scopes = ["openid", "email", "phone", "profile"]
}

# Hosted UI domain
resource "aws_cognito_user_pool_domain" "domain" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.pool.id
}

output "user_pool_id" {
  value = aws_cognito_user_pool.pool.id
}

# Allow Cognito to invoke each Lambda trigger
resource "aws_lambda_permission" "allow_define_auth" {
  statement_id  = "AllowExecutionFromCognitoDefineAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.define_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.pool.arn
}

resource "aws_lambda_permission" "allow_create_auth" {
  statement_id  = "AllowExecutionFromCognitoCreateAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.pool.arn
}

resource "aws_lambda_permission" "allow_verify_auth" {
  statement_id  = "AllowExecutionFromCognitoVerifyAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.pool.arn
}

resource "aws_lambda_permission" "allow_pre_signup" {
  statement_id  = "AllowExecutionFromCognitoPreSignup"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.pool.arn
}

resource "aws_lambda_permission" "allow_pre_token_gen" {
  statement_id  = "AllowExecutionFromCognitoPreTokenGen"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_token_gen.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.pool.arn
}

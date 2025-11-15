variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "what-call-recorder"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "sms_sender_id" {
  description = "Optional SMS sender ID"
  type        = string
  default     = null
}

variable "otp_ttl_minutes" {
  description = "OTP validity in minutes"
  type        = number
  default     = 10
}

variable "cognito_domain_prefix" {
  description = "Cognito Hosted UI domain prefix (must be globally unique per region)"
  type        = string
  default     = "what-call-recorder-dev"
}

variable "redirect_signin_urls" {
  description = "Allowed redirect URIs for sign-in"
  type        = list(string)
  default     = [
    "http://localhost:8080/",
    "http://localhost:8080/index.html"
  ]
}

variable "redirect_signout_urls" {
  description = "Allowed redirect URIs for sign-out"
  type        = list(string)
  default     = [
    "http://localhost:8080/"
  ]
}

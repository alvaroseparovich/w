SHELL := /usr/bin/env bash

ENV ?= dev
REGION ?= us-east-1
TF_DIR := infra/terraform

.PHONY: init plan deploy destroy build-lambdas approve-user

init:
	cd $(TF_DIR) && terraform init

plan: build-lambdas
	cd $(TF_DIR) && terraform plan -var="environment=$(ENV)" -var="aws_region=$(REGION)"

deploy: build-lambdas
	cd $(TF_DIR) && terraform apply -auto-approve -var="environment=$(ENV)" -var="aws_region=$(REGION)"

destroy:
	cd $(TF_DIR) && terraform destroy -var="environment=$(ENV)" -var="aws_region=$(REGION)"

build-lambdas:
	bash $(TF_DIR)/lambdas/build.sh

approve-user:
	@if [ -z "$(PHONE)" ]; then echo "PHONE is required, e.g., make approve-user PHONE=+5511987792799"; exit 1; fi
	aws cognito-idp admin-confirm-sign-up \
		--user-pool-id "$$(cd $(TF_DIR) && terraform output -raw user_pool_id 2>/dev/null || echo '<POOL_ID>')" \
		--username "$(PHONE)" \
		--region $(REGION)

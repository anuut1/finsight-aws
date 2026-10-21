#!/usr/bin/env bash
set -euo pipefail

# FinSight AWS Automated Deployment Script (Bash)
REGION="${1:-ap-south-1}"
ENVIRONMENT="${2:-prod}"
STACK_NAME="${3:-finsight-prod-stack}"

echo "=============================================="
echo "   FinSight AWS CloudFormation Deployer       "
echo "=============================================="

# 1. Verify AWS CLI
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "Error: AWS CLI is not configured or authenticated. Run 'aws configure' first."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Authenticated to AWS Account: ${ACCOUNT_ID} in region: ${REGION}"

# 2. Read or generate parameters
if [ -z "${MONGO_URI:-}" ]; then
    read -rp "Enter MongoDB Atlas Connection URI: " MONGO_URI
fi

if [ -z "${JWT_SECRET:-}" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "Generated random JWT Secret."
fi

if [ -z "${REMINDER_SECRET_KEY:-}" ]; then
    REMINDER_SECRET_KEY=$(openssl rand -hex 32)
    echo "Generated random Reminder Secret Key."
fi

SES_FROM_EMAIL="${SES_FROM_EMAIL:-notifications@yourdomain.com}"

# 3. Deploy CloudFormation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/cloudformation-full-stack.yaml"

echo ""
echo "Deploying CloudFormation stack '${STACK_NAME}'..."

aws cloudformation deploy \
    --template-file "${TEMPLATE_FILE}" \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        EnvironmentName="${ENVIRONMENT}" \
        MongoUri="${MONGO_URI}" \
        JwtSecret="${JWT_SECRET}" \
        ReminderSecretKey="${REMINDER_SECRET_KEY}" \
        SesFromEmail="${SES_FROM_EMAIL}"

echo ""
echo "Stack deployed successfully!"
echo "Outputs:"
aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query "Stacks[0].Outputs" \
    --output table

# FinSight AWS Automated Deployment Script (PowerShell)
param (
    [string]$Region = "ap-south-1",
    [string]$Environment = "prod",
    [string]$StackName = "finsight-prod-stack",
    [string]$MongoUri = "",
    [string]$JwtSecret = "",
    [string]$ReminderSecretKey = "",
    [string]$SesFromEmail = "notifications@yourdomain.com"
)

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   FinSight AWS CloudFormation Deployer       " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# 1. Check AWS CLI
try {
    $caller = aws sts get-caller-identity --output json | ConvertFrom-Json
    Write-Host "Authenticated as AWS Account: $($caller.Account) ($($caller.Arn))" -ForegroundColor Green
} catch {
    Write-Error "AWS CLI is not authenticated. Please run 'aws configure' first."
    exit 1
}

# 2. Prompt for missing secrets if not provided
if (-not $MongoUri) {
    $MongoUri = Read-Host "Enter your MongoDB Atlas Connection URI"
}
if (-not $JwtSecret) {
    # Generate random 32-byte hex if empty
    $bytes = New-Object byte[] 32
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $JwtSecret = ($bytes | ForEach-Object { "{0:x2}" -f $_ }) -join ''
    Write-Host "Generated random JWT Secret." -ForegroundColor Yellow
}
if (-not $ReminderSecretKey) {
    $bytes = New-Object byte[] 32
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $ReminderSecretKey = ($bytes | ForEach-Object { "{0:x2}" -f $_ }) -join ''
    Write-Host "Generated random Reminder Secret Key." -ForegroundColor Yellow
}

# 3. Deploy CloudFormation Stack
Write-Host "`nDeploying CloudFormation stack '$StackName' to region '$Region'..." -ForegroundColor Cyan

$TemplateFile = Join-Path $PSScriptRoot "cloudformation-full-stack.yaml"

aws cloudformation deploy `
    --template-file $TemplateFile `
    --stack-name $StackName `
    --region $Region `
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM `
    --parameter-overrides `
        EnvironmentName=$Environment `
        MongoUri="$MongoUri" `
        JwtSecret="$JwtSecret" `
        ReminderSecretKey="$ReminderSecretKey" `
        SesFromEmail="$SesFromEmail"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nStack deployed successfully!" -ForegroundColor Green

    # Fetch outputs
    $outputs = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query "Stacks[0].Outputs" `
        --output table
    Write-Host "`nStack Outputs:" -ForegroundColor Cyan
    Write-Output $outputs
} else {
    Write-Error "CloudFormation deployment failed."
}

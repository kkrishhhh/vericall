# AWS Deployment Infrastructure for Vantage AI

This folder contains Terraform configuration for deploying the backend API and frontend hosting in AWS.

## Components
- VPC with public subnets
- Application Load Balancer (ALB)
- ECS Fargate cluster and service for the backend API
- ECR repository for backend container image
- S3 bucket for frontend static hosting

## Quickstart
1. Install Terraform
2. Set AWS credentials in the environment
3. Run:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

## Notes
- The backend container image is built separately and pushed to the ECR repository created by Terraform.
- The frontend is hosted as a public S3 bucket. For production, attach CloudFront and a custom domain.

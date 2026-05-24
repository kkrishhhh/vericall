# AWS Deployment Infrastructure for Vantage AI

This folder contains Terraform configuration for deploying the backend API and frontend hosting in AWS.

## Components
- VPC with public subnets
- Application Load Balancer (ALB)
- ECS Fargate cluster and service for the backend API
- ECR repository for backend container image
- S3 bucket for frontend static hosting
- CloudFront distribution for edge delivery with India PoPs
- ElastiCache Redis for OTP/state and rate limiting
- Optional S3 KYC document bucket with AES-256 encryption
- ChromaDB vector retrieval for RAG citations

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
- KYC documents can be stored in S3 with AES-256 encryption enabled for data-at-rest protection.
- Redis-backed ElastiCache is used for OTP management and rate limiting in the production architecture.
- ChromaDB is used by the backend for retrieval-augmented generation (RAG) of RBI policy citations.

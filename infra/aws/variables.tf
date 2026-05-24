variable "aws_region" {
  type        = string
  default     = "ap-south-1"
  description = "AWS region to deploy Vantage AI infrastructure"
}

variable "project_name" {
  type        = string
  default     = "vantage-ai"
  description = "Project name used for resource naming"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "CIDR range for the VPC"
}

variable "public_subnet_count" {
  type        = number
  default     = 2
  description = "Number of public subnets to create"
}

variable "alb_port" {
  type        = number
  default     = 80
  description = "Port the Application Load Balancer listens on"
}

variable "backend_port" {
  type        = number
  default     = 8001
  description = "Backend container and ECS target port"
}

variable "backend_cpu" {
  type        = number
  default     = 512
  description = "CPU units for the ECS task definition"
}

variable "backend_memory" {
  type        = number
  default     = 1024
  description = "Memory for the ECS task definition (MB)"
}

variable "backend_desired_count" {
  type        = number
  default     = 1
  description = "Number of ECS tasks to keep running"
}

variable "frontend_bucket_acl" {
  type        = string
  default     = "public-read"
  description = "ACL for the frontend S3 bucket"
}

variable "backend_image_tag" {
  type        = string
  default     = "latest"
  description = "ECR image tag used by the ECS task definition"
}

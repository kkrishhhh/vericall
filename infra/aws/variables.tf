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

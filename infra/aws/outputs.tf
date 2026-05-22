output "alb_dns_name" {
  description = "Public DNS name of the application load balancer"
  value       = aws_lb.app.dns_name
}

output "ecs_cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "ecr_repository_uri" {
  description = "ECR repository URI for the backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_bucket_name" {
  description = "S3 bucket name for frontend hosting"
  value       = aws_s3_bucket.frontend.id
}
